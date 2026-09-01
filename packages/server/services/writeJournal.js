// writeJournal.js — An append-only local record of everything Jira+ changed.
//
// This exists so "what did this tool do to my board?" has an answer. It is a
// trust feature, not an operations one.
//
// Request bodies are deliberately excluded. The journal records attribution —
// which issue, which field, when, and whether it worked — not a second copy of
// the data. Nothing here is ever sent to Jira or anywhere else.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the journal lives, beside the configuration document. */
const JOURNAL_FILE_PATH = path.join(
  process.env.APPDATA || os.homedir(),
  'JiraPlus',
  'write-journal.json',
);

/** Entries kept before the oldest are discarded, so the file cannot grow without bound. */
const MAXIMUM_JOURNAL_ENTRIES = 5_000;

/** HTTP methods that change something in Jira, and therefore must be recorded. */
const MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

/** Classifies a Jira endpoint so the journal reads as actions, not as URLs. */
const ENDPOINT_CLASSIFIERS = [
  { pattern: /\/issue\/[^/]+\/transitions/i, action: 'transition' },
  { pattern: /\/issue\/[^/]+\/comment/i, action: 'comment' },
  { pattern: /\/issue\/[^/]+\/worklog/i, action: 'worklog' },
  { pattern: /\/issueLink/i, action: 'link' },
  { pattern: /\/issue\/[^/]+$/i, action: 'field' },
  { pattern: /\/issue$/i, action: 'create' },
];

/** In-memory mirror of the journal, so a read never waits on the disk. */
let journalEntries = null;

/** Is this request one that changes something in Jira? */
function isMutatingRequest(method) {
  return MUTATING_METHODS.includes(String(method).toUpperCase());
}

/** Names what an endpoint does, so an entry is readable without decoding a URL. */
function classifyEndpoint(endpointPath) {
  const match = ENDPOINT_CLASSIFIERS.find((classifier) => classifier.pattern.test(endpointPath));
  return match ? match.action : 'other';
}

/** Extracts the issue key from a Jira path, when the path names one. */
function readIssueKeyFromPath(endpointPath) {
  const match = /\/issue\/([A-Z][A-Z0-9]*-\d+)/i.exec(endpointPath);
  return match ? match[1].toUpperCase() : null;
}

/** Loads the journal from disk once, tolerating a missing or corrupt file. */
function loadJournal() {
  if (journalEntries !== null) return journalEntries;
  try {
    const parsed = JSON.parse(fs.readFileSync(JOURNAL_FILE_PATH, 'utf8'));
    journalEntries = Array.isArray(parsed) ? parsed : [];
  } catch {
    journalEntries = [];
  }
  return journalEntries;
}

/** Persists the journal, keeping only the most recent entries. */
function persistJournal(entries) {
  const trimmed = entries.slice(-MAXIMUM_JOURNAL_ENTRIES);
  journalEntries = trimmed;
  try {
    fs.mkdirSync(path.dirname(JOURNAL_FILE_PATH), { recursive: true });
    fs.writeFileSync(JOURNAL_FILE_PATH, JSON.stringify(trimmed), 'utf8');
  } catch {
    // A journal that cannot be written must not stop a write the user asked for.
    // The in-memory mirror still answers for this session.
  }
}

/**
 * Records one change Jira+ made.
 *
 * Called before the request is forwarded, so an attempt is never lost to a
 * crash, and updated with the outcome when the reply arrives.
 *
 * @returns {string} An identifier for completing the entry with its outcome.
 */
function recordJiraWrite({ method, endpointPath, source }) {
  const entries = loadJournal();
  const entryId = `write-${Date.now().toString(36)}-${entries.length.toString(36)}`;
  entries.push({
    entryId,
    atIso: new Date().toISOString(),
    method: String(method).toUpperCase(),
    endpointPath,
    action: classifyEndpoint(endpointPath),
    issueKey: readIssueKeyFromPath(endpointPath),
    source: source || 'ui',
    outcome: 'attempted',
  });
  persistJournal(entries);
  return entryId;
}

/** Completes an entry once Jira has answered, so the journal states what happened. */
function completeJiraWrite(entryId, { statusCode }) {
  const entries = loadJournal();
  const entry = entries.find((candidate) => candidate.entryId === entryId);
  if (!entry) return;
  entry.statusCode = statusCode;
  entry.outcome = statusCode >= 200 && statusCode < 300 ? 'applied' : 'failed';
  persistJournal(entries);
}

/** Every recorded change, newest first, for the in-app change log. */
function readJournal() {
  return [...loadJournal()].reverse();
}

/** Empties the journal. Used by tests; there is no route that calls it. */
function resetJournalForTesting() {
  journalEntries = [];
  persistJournal([]);
}

export {
  JOURNAL_FILE_PATH,
  MAXIMUM_JOURNAL_ENTRIES,
  MUTATING_METHODS,
  classifyEndpoint,
  completeJiraWrite,
  isMutatingRequest,
  readJournal,
  recordJiraWrite,
  resetJournalForTesting,
};
