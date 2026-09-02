// app.js — Assembles the Express application, without binding a port.
//
// Kept separate from server.js so tests can exercise the real routes over the
// real middleware without starting a listener. What the test drives is what
// runs in production, which is the only way an integration test is worth having.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import compression from 'compression';
import express from 'express';

import { isJiraConfigured } from './config/loader.js';
import { createConnectionRouter } from './routes/connection.js';
import { createJiraProxyRouter } from './routes/jiraProxy.js';
import { createUpdatesRouter } from './routes/updates.js';
import { describeInstance, scheduleStop } from './services/instanceService.js';
import { resolveInstalledVersion } from './services/versionService.js';
import { createWorkspaceRouter } from './routes/workspace.js';
import { createWriteJournalRouter } from './routes/writeJournalRoute.js';

/** Largest JSON body accepted; a workspace document is far smaller than this. */
const MAXIMUM_BODY_SIZE = '2mb';

/**
 * Where the built client lives.
 *
 * Two very different situations, and getting this wrong means a server that
 * starts and serves nothing — a confusing way to fail. Running from source, the
 * client sits beside this package. Running from the packaged executable, it is
 * inside the snapshot the bundler wrote, next to the bundled entry point.
 *
 * Both are tried, in that order, and the first one that actually exists wins.
 */
function resolveClientDistPath() {
  const thisDirectory = path.dirname(fileURLToPath(import.meta.url));

  const candidates = [
    // From source: packages/server → packages/client/dist
    path.join(thisDirectory, '..', 'client', 'dist'),
    // From the packaged executable: the bundle sits beside the snapshot assets.
    path.join(thisDirectory, 'packages', 'client', 'dist'),
    path.join(thisDirectory, '..', 'packages', 'client', 'dist'),
  ];

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')))
    ?? candidates[0];
}

const CLIENT_DIST_PATH = resolveClientDistPath();

/**
 * The version this process is running.
 *
 * Baked into the bundle at build time. v0.1.3 read it from a package.json path
 * relative to the SOURCE tree, which does not exist inside the packaged
 * executable, so every packaged build reported itself as 0.0.0 - and the updater
 * then tried to install 0.1.3 over the 0.1.3 it was running from.
 *
 * A build that has to find a file to know what it is will one day not find it.
 */
function readInstalledVersion() {
  return resolveInstalledVersion(
    typeof __JIRAPLUS_VERSION__ === 'string' ? __JIRAPLUS_VERSION__ : undefined,
    () => {
      try {
        const manifestPath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '..',
          '..',
          'package.json',
        );
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version ?? null;
      } catch {
        return null;
      }
    },
  );
}

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
  // Setting the one credential. Registered before the proxy so an
  // unconfigured installation can still be configured.
  app.use(createConnectionRouter(config));
  app.use(createJiraProxyRouter(config));
  app.use(createWorkspaceRouter());
  // Checking for a newer version needs no credential and reaches GitHub, not
  // Jira, so it works on an installation that was never configured.
  app.use(createUpdatesRouter(readInstalledVersion()));
  app.use(createWriteJournalRouter());

  // Reports what is configured — never the credential itself, only whether one
  // is present. A screen can then say what is missing rather than failing on the
  // first request.
  // Which copy this is. Jira+ runs hidden, so without this the only way to
  // tell one copy from another was Task Manager.
  app.get('/api/instance', (req, res) => {
    res.json({ ...describeInstance(config), version: readInstalledVersion() });
  });

  // Answered BEFORE the process exits, so a successful stop is
  // distinguishable from a broken button.
  app.post('/api/instance/stop', (req, res) => {
    res.json({ isStopping: true, processId: process.pid });
    scheduleStop(config.isStopDeferred === true);
  });

  app.get('/api/health', (req, res) => {
    res.json({
      isRunning: true,
      isJiraConfigured: isJiraConfigured(config),
      jiraBaseUrl: config.baseUrl,
      isSslVerified: config.isSslVerified,
      // Reported so a blank page has an explanation rather than a mystery.
      isInterfaceAvailable: fs.existsSync(path.join(CLIENT_DIST_PATH, 'index.html')),
    });
  });

  app.use(express.static(CLIENT_DIST_PATH));

  return app;
}

export { CLIENT_DIST_PATH, MAXIMUM_BODY_SIZE, createApp };
