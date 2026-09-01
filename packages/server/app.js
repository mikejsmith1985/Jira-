// app.js — Assembles the Express application, without binding a port.
//
// Kept separate from server.js so tests can exercise the real routes over the
// real middleware without starting a listener. What the test drives is what
// runs in production, which is the only way an integration test is worth having.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import compression from 'compression';
import express from 'express';

import { isJiraConfigured } from './config/loader.js';
import { createJiraProxyRouter } from './routes/jiraProxy.js';
import { createWorkspaceRouter } from './routes/workspace.js';
import { createWriteJournalRouter } from './routes/writeJournalRoute.js';

/** Largest JSON body accepted; a workspace document is far smaller than this. */
const MAXIMUM_BODY_SIZE = '2mb';

/** Where the built client lives, relative to this file. */
const CLIENT_DIST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'dist',
);

/**
 * Builds the application.
 *
 * The configuration object is held by reference rather than copied, so a
 * credential saved during setup takes effect on the next request instead of
 * after a restart.
 */
function createApp(config) {
  const app = express();

  app.use(compression());
  app.use(express.json({ limit: MAXIMUM_BODY_SIZE }));

  // Every route that reaches Jira. There is exactly one, which is what makes the
  // write journal impossible to bypass.
  app.use(createJiraProxyRouter(config));
  app.use(createWorkspaceRouter());
  app.use(createWriteJournalRouter());

  // Reports what is configured — never the credential itself, only whether one
  // is present. A screen can then say what is missing rather than failing on the
  // first request.
  app.get('/api/health', (req, res) => {
    res.json({
      isRunning: true,
      isJiraConfigured: isJiraConfigured(config),
      jiraBaseUrl: config.baseUrl,
      isSslVerified: config.isSslVerified,
    });
  });

  app.use(express.static(CLIENT_DIST_PATH));

  return app;
}

export { CLIENT_DIST_PATH, MAXIMUM_BODY_SIZE, createApp };
