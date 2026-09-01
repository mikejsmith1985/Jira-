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

  // Export hands over the whole document, so an import can reproduce the
  // exporter's fingerprint exactly.
  router.get('/api/workspace/export', (req, res) => {
    const stored = readStoredWorkspace() ?? buildDefaultWorkspaceConfiguration();
    res.setHeader('content-disposition', 'attachment; filename="jira-plus-workspace.json"');
    res.json(stored);
  });

  /**
   * Import REPLACES the configuration wholly. It never merges.
   *
   * A merge would produce a configuration matching neither party's, carrying a
   * third fingerprint — which would make the mechanism worse than useless,
   * because it would manufacture the disagreement it exists to reveal.
   *
   * The differences are returned first and applied only on confirmation, so
   * nobody replaces a configuration without seeing what changes.
   */
  router.post('/api/workspace/import', (req, res) => {
    const incoming = req.body?.configuration ?? req.body;
    const review = reviewStoredWorkspace(incoming);

    if (review.status !== 'current') {
      res.status(400).json({ review });
      return;
    }

    const current = readStoredWorkspace() ?? buildDefaultWorkspaceConfiguration();
    const incomingFingerprint = computeFingerprint(review.configuration);
    const currentFingerprint = computeFingerprint(current);

    if (req.body?.isConfirmed !== true) {
      res.json({
        requiresConfirmation: true,
        currentFingerprint,
        incomingFingerprint,
        willChange: incomingFingerprint !== currentFingerprint,
        differences: describeDifferences(current, review.configuration),
      });
      return;
    }

    const configuration = {
      ...review.configuration,
      updatedAtIso: new Date().toISOString(),
      updatedBy: os.userInfo().username,
    };
    writeWorkspace(configuration);

    res.json({ configuration, fingerprint: computeFingerprint(configuration) });
  });

  return router;
}

/**
 * Names what an import would change, so a replacement is never a surprise.
 *
 * The two entries about charts and durations exist because those changes move
 * every figure on screen at once, which is worth saying out loud rather than
 * leaving somebody to notice afterwards.
 */
function describeDifferences(current, incoming) {
  const differences = [];

  for (const [conceptId, entry] of Object.entries(incoming.fieldMap)) {
    const currentEntry = current.fieldMap[conceptId];
    if (JSON.stringify(currentEntry) !== JSON.stringify(entry)) {
      differences.push(`${conceptId}: ${currentEntry?.state ?? 'missing'} becomes ${entry.state}`);
    }
  }

  if (JSON.stringify(current.enabledCheckIds) !== JSON.stringify(incoming.enabledCheckIds)) {
    differences.push(
      `enabled checks: ${current.enabledCheckIds.join(', ')} becomes ${incoming.enabledCheckIds.join(', ')}`,
    );
  }

  if (JSON.stringify(current.completionLenses) !== JSON.stringify(incoming.completionLenses)) {
    differences.push('the definitions of finished change, so every chart will move');
  }

  if (JSON.stringify(current.workingCalendar) !== JSON.stringify(incoming.workingCalendar)) {
    differences.push('the working calendar changes, so every duration will move');
  }

  return differences;
}

export {
  WORKSPACE_FILE_PATH,
  createWorkspaceRouter,
  describeDifferences,
  readStoredWorkspace,
};
