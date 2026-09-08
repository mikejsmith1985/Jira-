// relayBridge.js — Reaching Jira with no token, through the browser you already trust.
//
// Every release so far opened by demanding a personal access token, and setup
// has been the worst part of using this. The relay removes the demand rather
// than making it easier.
//
// A bookmarklet, clicked once on a Jira tab, long-polls this bridge and executes
// each request with `fetch(..., {credentials: "include"})` INSIDE that tab. The
// credential is therefore the session cookie the browser already holds — the
// same one that makes Jira work when you click a link. Jira+ never sees it,
// never stores it, and there is nothing to create, paste, rotate or revoke.
//
// This bridge holds no credentials of its own. It is a message queue and nothing
// more: Jira+ posts a request, the bookmarklet collects it, executes it, and
// posts the answer back. All state is in memory and resets when the server
// restarts, which is deliberate — a queue that survives a restart would hand a
// stale request to whichever tab opened next.
//
// The pattern is NodeToolbox's, proven there against ServiceNow. Jira was listed
// among its supported systems and no bookmarklet was ever written for it, so
// this is the missing piece rather than a new idea.

import express from 'express';

import { buildJiraBookmarklet } from '../services/jiraBookmarklet.js';

/** How long the bookmarklet's poll is held open before answering "nothing yet". */
const POLL_TIMEOUT_MS = 28000;

/** How long a caller waits for the browser to come back with an answer. */
const RESULT_TIMEOUT_MS = 30000;

/** The longest a caller may ask to wait. A retrieval of many pages is slow. */
const MAX_RESULT_TIMEOUT_MS = 180000;

/** Silence longer than this means the tab is gone, whatever it last said. */
const HEARTBEAT_STALE_MS = 65000;

/** Statuses that mean Jira refused us, rather than failed to answer. */
const REFUSED_STATUSES = [401, 403];

/** What a caller is told when there is no browser tab to execute its request. */
const NOT_CONNECTED_REASON =
  'No Jira tab is relaying. Open Jira, click the Jira+ bookmarklet, and try again.';

/** Live state. One channel, because Jira is the only system Jira+ talks to. */
let channel = createChannel();

/** A clean channel. Everything about a relay session lives here and nowhere else. */
function createChannel() {
  return {
    isActive: false,
    /** Requests waiting for the bookmarklet to collect them. */
    pendingRequests: [],
    /** Answers waiting for their caller to collect them, keyed by request id. */
    pendingResults: {},
    /** The bookmarklet's held-open poll, if it is currently waiting. */
    pollWaiters: [],
    /** Callers held open waiting for an answer, keyed by request id. */
    resultWaiters: {},
    /** Where the bookmarklet is running. Requests go to this origin. */
    origin: null,
    /** Who Jira says the browser is signed in as. Evidence, not decoration. */
    displayName: null,
    lastPolledAt: null,
    lastRefusedAt: null,
    lastAcceptedAt: null,
  };
}

/** Discards every relay session. Exported so tests start from a known state. */
function resetRelayState() {
  releaseWaitingCallers(NOT_CONNECTED_REASON);
  channel = createChannel();
}

/**
 * Has Jira refused us more recently than it accepted us?
 *
 * Deliberately optimistic before anything has been tried: a channel that has
 * never been refused has not been refused, and reporting a fresh relay as
 * unauthorised is its own false alarm.
 */
function isRelayAuthorized() {
  if (channel.lastRefusedAt === null) return true;
  return channel.lastAcceptedAt !== null && channel.lastAcceptedAt > channel.lastRefusedAt;
}

/**
 * Is a browser tab actually relaying right now?
 *
 * The poll IS the heartbeat. A tab that closed sends none, so silence past the
 * stale window means gone — whatever the last register said.
 */
function isRelayReady() {
  if (!channel.isActive || channel.lastPolledAt === null) return false;
  return Date.now() - channel.lastPolledAt <= HEARTBEAT_STALE_MS;
}

/**
 * Fails every caller currently waiting for an answer.
 *
 * When the tab goes away those requests can never complete, so failing them now
 * gives somebody a sentence they can act on instead of a thirty-second freeze.
 */
function releaseWaitingCallers(reason) {
  for (const requestId of Object.keys(channel.resultWaiters)) {
    const waiter = channel.resultWaiters[requestId];
    clearTimeout(waiter.timer);
    waiter.res.status(503).json({ reason });
    delete channel.resultWaiters[requestId];
  }
}

/** Caps a requested wait, so one caller cannot hold a connection open forever. */
function resolveResultTimeoutMs(requestedTimeout) {
  const requested = Number(requestedTimeout);
  if (!Number.isFinite(requested) || requested <= 0) return RESULT_TIMEOUT_MS;
  return Math.min(requested, MAX_RESULT_TIMEOUT_MS);
}

/** What a screen is allowed to know about the relay. */
function describeRelay() {
  return {
    isConnected: isRelayReady(),
    isAuthorized: isRelayAuthorized(),
    origin: channel.origin,
    displayName: channel.displayName,
    lastPolledAt: channel.lastPolledAt,
  };
}

/**
 * Lets the bookmarklet reach this bridge from the Jira origin.
 *
 * The bookmarklet runs on https://jira.example.org and calls http://127.0.0.1.
 * Corporate Chrome and Edge treat that as private-network access and block it
 * outright unless the response says otherwise, so these headers are what make
 * the whole mechanism possible rather than a convenience.
 */
function applyRelayCorsHeaders(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

/**
 * Sends one request through the relaying browser tab and waits for the answer.
 *
 * This is what lets the Jira proxy stay the ONE door to Jira. Rather than the
 * browser choosing between two transports - which would give the write journal
 * a second path to miss - the proxy asks here when there is no token, and every
 * feature reaches Jira through the same function it always did.
 *
 * @returns {Promise<{ok: boolean, status: number, data: string|null, error: string|null}>}
 */
function submitRelayRequest({ method, path: apiPath, body, timeoutMs }) {
  return new Promise((resolve) => {
    const requestId = `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const wait = timeoutMs ?? RESULT_TIMEOUT_MS;

    const entry = { id: requestId, method: method ?? 'GET', path: apiPath, body: body ?? null, timeoutMs: wait };

    const waiter = channel.pollWaiters.shift();
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      waiter.res.json({ request: entry });
    } else {
      channel.pendingRequests.push(entry);
    }

    const timer = setTimeout(() => {
      delete channel.resultWaiters[requestId];
      resolve({
        ok: false,
        status: 504,
        data: null,
        error: `The relaying Jira tab did not answer within ${Math.round(wait / 1000)} seconds.`,
      });
    }, wait);

    // Resolved by the /result route, which delivers to whatever is waiting here.
    channel.resultWaiters[requestId] = {
      timer,
      res: {
        status: () => ({ json: (payload) => resolve({ ok: false, status: 503, data: null, error: payload.reason }) }),
        json: (payload) => resolve(payload.result),
      },
    };
  });
}

/** Is a browser tab relaying right now? Asked by the proxy before it forwards. */
function isRelayConnected() {
  return isRelayReady();
}

/** Creates the relay router. */
function createRelayBridgeRouter(config) {
  const router = express.Router();
  router.use(applyRelayCorsHeaders);

  // ── The bookmarklet announces itself ──────────────────────────────────────
  router.post('/api/relay/register', (req, res) => {
    const { origin, displayName } = req.body ?? {};
    // A fresh session starts empty. Anything queued before the previous tab
    // closed is stale, and executing it now is a surprise nobody asked for.
    channel = createChannel();
    channel.isActive = true;
    channel.lastPolledAt = Date.now();
    channel.origin = typeof origin === 'string' ? origin : null;
    channel.displayName = typeof displayName === 'string' ? displayName : null;
    res.json(describeRelay());
  });

  router.post('/api/relay/deregister', (req, res) => {
    releaseWaitingCallers('The Jira tab relaying for Jira+ was closed.');
    channel = createChannel();
    res.json(describeRelay());
  });

  router.get('/api/relay/status', (req, res) => {
    res.json(describeRelay());
  });

  // ── Jira+ asks for something ──────────────────────────────────────────────
  router.post('/api/relay/request', (req, res) => {
    if (!isRelayReady()) {
      res.status(503).json({ reason: NOT_CONNECTED_REASON });
      return;
    }

    const { id, method, path: apiPath, body, timeoutMs } = req.body ?? {};
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ reason: 'A relayed request needs an id.' });
      return;
    }

    const entry = {
      id,
      method: method ?? 'GET',
      path: apiPath,
      body: body ?? null,
      timeoutMs: timeoutMs ?? RESULT_TIMEOUT_MS,
    };

    // Handed straight over when the bookmarklet is already waiting, so a request
    // does not sit in a queue for up to 28 seconds behind an idle poll.
    const waiter = channel.pollWaiters.shift();
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      waiter.res.json({ request: entry });
    } else {
      channel.pendingRequests.push(entry);
    }

    res.json({ isQueued: true, id });
  });

  // ── The bookmarklet collects work ─────────────────────────────────────────
  router.get('/api/relay/poll', (req, res) => {
    // A poll is the heartbeat AND the proof of life. Marking the channel active
    // here is what lets a tab that never closed survive a server restart without
    // anybody clicking the bookmarklet again.
    channel.isActive = true;
    channel.lastPolledAt = Date.now();

    const queued = channel.pendingRequests.shift();
    if (queued !== undefined) {
      res.json({ request: queued });
      return;
    }

    const waiter = { res, timer: null };
    waiter.timer = setTimeout(
      () => {
        const index = channel.pollWaiters.indexOf(waiter);
        if (index >= 0) channel.pollWaiters.splice(index, 1);
        res.json({ request: null });
      },
      resolveResultTimeoutMs(req.query.timeoutMs) === RESULT_TIMEOUT_MS
        ? POLL_TIMEOUT_MS
        : Number(req.query.timeoutMs),
    );
    channel.pollWaiters.push(waiter);
  });

  // ── The bookmarklet reports what Jira said ────────────────────────────────
  router.post('/api/relay/result', (req, res) => {
    const { id, ok, status, data, error } = req.body ?? {};
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ reason: 'A relayed result needs an id.' });
      return;
    }

    // The only place the server learns a relayed call was refused. Without it a
    // dropped VPN leaves the connection reading green while every call 401s.
    if (REFUSED_STATUSES.includes(Number(status))) {
      channel.lastRefusedAt = Date.now();
    } else if (ok === true) {
      channel.lastAcceptedAt = Date.now();
    }

    const result = { id, ok: ok === true, status: Number(status) || 0, data: data ?? null, error: error ?? null };
    const waiter = channel.resultWaiters[id];
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      delete channel.resultWaiters[id];
      waiter.res.json({ result });
    } else {
      channel.pendingResults[id] = result;
    }

    res.json({ isRecorded: true });
  });

  // ── Jira+ collects the answer ─────────────────────────────────────────────
  router.get('/api/relay/result/:id', (req, res) => {
    const requestId = req.params.id;

    const alreadyPosted = channel.pendingResults[requestId];
    if (alreadyPosted !== undefined) {
      delete channel.pendingResults[requestId];
      res.json({ result: alreadyPosted });
      return;
    }

    const timeoutMs = resolveResultTimeoutMs(req.query.timeoutMs);
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => {
      delete channel.resultWaiters[requestId];
      res.status(408).json({
        reason:
          `Jira did not answer within ${Math.round(timeoutMs / 1000)} seconds. ` +
          'The relaying tab may have been closed or navigated away.',
      });
    }, timeoutMs);
    channel.resultWaiters[requestId] = waiter;
  });

  // ── The bookmarklet somebody drags to their bar ───────────────────────────
  router.get('/api/relay/bookmarklet', (req, res) => {
    res.json({ code: buildJiraBookmarklet(config.port) });
  });

  return router;
}

export {
  HEARTBEAT_STALE_MS,
  MAX_RESULT_TIMEOUT_MS,
  NOT_CONNECTED_REASON,
  POLL_TIMEOUT_MS,
  RESULT_TIMEOUT_MS,
  createRelayBridgeRouter,
  isRelayConnected,
  resetRelayState,
  submitRelayRequest,
};
