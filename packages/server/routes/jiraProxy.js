// jiraProxy.js — Every request to Jira passes through here, and nowhere else.
//
// Two consequences follow from that being the only route. The credential is
// attached on this side of the wire, so the browser never holds it; and because
// nothing can reach Jira without coming through this function, the write
// journal cannot be bypassed. "What did this tool change?" is answerable
// because there is exactly one door.

import express from 'express';

import { forwardToJira } from '../utils/httpClient.js';
import { completeJiraWrite, isMutatingRequest, recordJiraWrite } from '../services/writeJournal.js';

/** The prefix the browser calls, stripped before forwarding. */
const PROXY_PREFIX = '/jira-proxy';

/**
 * Removes our prefix, leaving the Jira path with its query string intact.
 *
 * Built from `req.url` rather than `req.path` deliberately: `req.path` discards
 * the query string, and a JQL search is nothing without it.
 */
function buildDownstreamPath(requestUrl) {
  const remainder = requestUrl.slice(PROXY_PREFIX.length);
  return remainder.startsWith('/') ? remainder : `/${remainder}`;
}

/**
 * Creates the proxy router.
 *
 * Takes the live configuration object rather than a copy, so a credential saved
 * during setup takes effect without restarting the server.
 */
function createJiraProxyRouter(config) {
  const router = express.Router();

  router.all(`${PROXY_PREFIX}/*`, (req, res) => {
    const downstreamPath = buildDownstreamPath(req.url);

    // Recorded before forwarding so an attempt survives a crash, then completed
    // with its outcome when Jira answers.
    const journalEntryId = isMutatingRequest(req.method)
      ? recordJiraWrite({ method: req.method, endpointPath: downstreamPath, source: 'ui' })
      : null;

    if (journalEntryId !== null) {
      res.on('finish', () => completeJiraWrite(journalEntryId, { statusCode: res.statusCode }));
    }

    forwardToJira(req, res, config, downstreamPath);
  });

  return router;
}

export { PROXY_PREFIX, buildDownstreamPath, createJiraProxyRouter };
