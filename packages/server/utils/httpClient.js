// httpClient.js — Forwards one browser request to Jira with the credential
// attached on this side of the wire.
//
// Two behaviours here are not incidental. Corporate networks that inspect TLS
// re-sign traffic with their own certificate authority, which Node rejects
// unless verification is lowered — so that is configurable rather than
// hardcoded. And a 429 is passed through with its `Retry-After` intact, because
// a throttled response that looks like an empty one would let a partial
// retrieval read as a finished one.

import http from 'node:http';
import https from 'node:https';

import { isRelayConnected, submitRelayRequest } from '../routes/relayBridge.js';

/** How long to wait for Jira before giving up on a single request. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Response headers worth passing back, because the client reasons about them. */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-interval-seconds',
];

/**
 * Sends one request to Jira and streams the reply back to the browser.
 *
 * The personal access token is attached here and nowhere else. It is never
 * placed in a response, a redirect, or an error message.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{baseUrl: string, personalAccessToken: string, isSslVerified: boolean}} config
 * @param {string} downstreamPath Path plus query string, already stripped of our prefix.
 */
async function forwardToJira(req, res, config, downstreamPath) {
  // The no-token path. A browser tab relaying for us can reach Jira with the
  // session cookie it already holds, so an installation with no credential at
  // all is fully working rather than blocked.
  //
  // Checked BEFORE the address, because the relay does not need one: the
  // bookmarklet builds every URL from the origin of the tab it was clicked in,
  // which is by definition the right Jira.
  if (config.personalAccessToken.length === 0 && isRelayConnected()) {
    const relayed = await submitRelayRequest({
      method: req.method,
      path: downstreamPath,
      body: req.method === 'GET' || req.method === 'HEAD' ? null : req.body,
    });

    res.status(relayed.status || 502);
    res.type('application/json');
    res.send(
      relayed.data ??
        JSON.stringify({
          errorMessages: [relayed.error ?? 'The relaying Jira tab did not answer.'],
          jiraPlusFailureKind: 'transport',
        }),
    );
    return;
  }

  if (config.baseUrl.length === 0) {
    // Marked as Jira+'s own refusal. Jira cannot set this field, which is what
    // lets the interface tell an unfinished setup apart from a Jira outage that
    // happens to share the status code - and stops it reporting "Jira answered
    // with 503" about a request Jira never received.
    res.status(503).json({
      error: 'Jira is not configured',
      errorMessages: [
        'Jira+ has no way to reach Jira yet. Either click the Jira+ bookmarklet on a Jira tab, ' +
          'or open Setup and save an address and token.',
      ],
      jiraPlusFailureKind: 'not-configured',
      message: 'Set the Jira base URL and personal access token before making requests.',
    });
    return;
  }

  const target = new URL(downstreamPath, `${config.baseUrl}/`);
  const transport = target.protocol === 'https:' ? https : http;
  const payload = readParsedBody(req);

  const upstream = transport.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers: buildUpstreamHeaders(req, config, payload),
      rejectUnauthorized: config.isSslVerified,
      timeout: REQUEST_TIMEOUT_MS,
    },
    (upstreamResponse) => relayResponse(upstreamResponse, res),
  );

  upstream.on('timeout', () => {
    upstream.destroy();
    respondWithTransportFailure(res, `Jira did not respond within ${REQUEST_TIMEOUT_MS}ms.`);
  });

  upstream.on('error', (error) => {
    // The message is Node's, not Jira's, and says nothing about the credential.
    respondWithTransportFailure(res, error.message);
  });

  // The parsed body, when there is one: the stream it came from is spent.
  if (payload === null) req.pipe(upstream);
  else upstream.end(payload);
}

/**
 * The bytes to send upstream, or null when the raw stream can still be piped.
 *
 * This exists because of a failure with no symptom on this side. `express.json()`
 * runs before the proxy and CONSUMES the request stream, so `req.pipe(upstream)`
 * forwarded an EMPTY body on every write. Jira then refused a create with no
 * fields in it, quite correctly, with a 400 — and Jira+ reported the status and
 * nothing else, because Jira's answer to a request that malformed carries no
 * `errorMessages` to report.
 *
 * The parsed body is the only copy that still exists by the time we get here.
 */
function readParsedBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  // Only JSON was parsed, so only JSON has been consumed. Anything else still
  // has its stream and is piped as before.
  if (!req.is('application/json')) return null;
  return JSON.stringify(req.body ?? {});
}

/** Builds the upstream headers, attaching the credential the browser never sees. */
function buildUpstreamHeaders(req, config, payload) {
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${config.personalAccessToken}`,
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  // Stated rather than left to chunked encoding: some Jira deployments sit
  // behind a proxy that will not accept a chunked write.
  if (payload !== null) headers['content-length'] = Buffer.byteLength(payload);
  return headers;
}

/** Copies the status and the headers a client reasons about, then streams the body. */
function relayResponse(upstreamResponse, res) {
  res.status(upstreamResponse.statusCode || 502);
  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const headerValue = upstreamResponse.headers[headerName];
    if (headerValue !== undefined) res.setHeader(headerName, headerValue);
  }
  upstreamResponse.pipe(res);
}

/**
 * Reports a network-level failure in the shape the client's typed failure union
 * expects, so a connectivity problem is never mistaken for an empty result.
 */
function respondWithTransportFailure(res, message) {
  if (res.headersSent) return;
  res.status(502).json({ errorMessages: [message], jiraPlusFailureKind: 'transport' });
}

export { forwardToJira, REQUEST_TIMEOUT_MS };
