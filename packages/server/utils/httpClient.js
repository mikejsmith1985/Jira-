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
function forwardToJira(req, res, config, downstreamPath) {
  if (config.baseUrl.length === 0) {
    res.status(503).json({
      error: 'Jira is not configured',
      message: 'Set the Jira base URL and personal access token before making requests.',
    });
    return;
  }

  const target = new URL(downstreamPath, `${config.baseUrl}/`);
  const transport = target.protocol === 'https:' ? https : http;

  const upstream = transport.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers: buildUpstreamHeaders(req, config),
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

  req.pipe(upstream);
}

/** Builds the upstream headers, attaching the credential the browser never sees. */
function buildUpstreamHeaders(req, config) {
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${config.personalAccessToken}`,
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
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
