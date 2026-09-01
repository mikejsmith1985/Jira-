// workspace.js — The one configuration document, served from outside the browser.
//
// The predecessor kept its rule configuration in a browser storage key, so two
// people ran different checks and neither was told. Holding it here means every
// view in one installation is produced from the same configuration, and the
// fingerprint this route returns is what lets two people establish, from the
// artifacts alone, whether they were configured the same way.
//
// The fingerprint is computed by the engine — the same function the browser
// uses — rather than by a second implementation here. That is the whole reason
// the server imports @jira-plus/core.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import {
  buildDefaultWorkspaceConfiguration,
  computeFingerprint,
  reviewStoredWorkspace,
} from '@jira-plus/core';

/** Where the workspace document lives, beside the credential and the journal. */
const WORKSPACE_FILE_PATH = path.join(
  process.env.APPDATA || os.homedir(),
  'JiraPlus',
  'workspace.json',
);

/** Reads the stored document, or null when this installation has never saved one. */
function readStoredWorkspace() {
  try {
    return JSON.parse(fs.readFileSync(WORKSPACE_FILE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes the document, creating its directory on first save. */
function writeWorkspace(configuration) {
  fs.mkdirSync(path.dirname(WORKSPACE_FILE_PATH), { recursive: true });
  fs.writeFileSync(WORKSPACE_FILE_PATH, JSON.stringify(configuration, null, 2), 'utf8');
}

/**
 * Creates the workspace router.
 *
 * A first run returns defaults rather than an error, because having configured
 * nothing yet is the normal starting state — but those defaults map no Jira
 * field at all, so every check that needs one reports as not measurable rather
 * than passing.
 */
function createWorkspaceRouter() {
  const router = express.Router();

  router.get('/api/workspace', (req, res) => {
    const stored = readStoredWorkspace();
    if (stored === null) {
      const configuration = buildDefaultWorkspaceConfiguration();
      res.json({
        configuration,
        fingerprint: computeFingerprint(configuration),
        review: { status: 'current' },
        isFirstRun: true,
      });
      return;
    }

    // A document written under different rules is reported, never reinterpreted.
    const review = reviewStoredWorkspace(stored);
    if (review.status !== 'current') {
      res.status(409).json({ review, storedConfiguration: stored });
      return;
    }

    res.json({
      configuration: review.configuration,
      fingerprint: computeFingerprint(review.configuration),
      review,
      isFirstRun: false,
    });
  });

  router.put('/api/workspace', (req, res) => {
    const review = reviewStoredWorkspace(req.body);
    if (review.status !== 'current') {
      res.status(400).json({ review });
      return;
    }

    const configuration = {
      ...review.configuration,
      updatedAtIso: new Date().toISOString(),
      updatedBy: os.userInfo().username,
    };
    writeWorkspace(configuration);

    // The recomputed fingerprint goes back with the save, so the header updates
    // from the server's own view of the document rather than the browser's.
    res.json({ configuration, fingerprint: computeFingerprint(configuration) });
  });

  return router;
}

export { WORKSPACE_FILE_PATH, createWorkspaceRouter, readStoredWorkspace };
