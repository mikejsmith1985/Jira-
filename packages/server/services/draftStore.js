// draftStore.js — Where work in progress lives so it cannot be lost.
//
// A draft is kept on disk, in the profile directory beside the workspace
// document, rather than in browser storage. That is a deliberate departure from
// the product's rule that browser storage holds only ephemeral interface state,
// and the reason the rule exists does not apply here: it was written because
// CONFIGURATION in browser storage made two people run different rules
// invisibly. A draft changes no number.
//
// What does apply is that browser storage fails silently — a private window,
// cleared site data, a browser told to block it — and what is lost is the
// paragraph somebody just wrote. The predecessor keeps drafts there and carries
// a permanent banner warning that work may disappear. A banner is not a fix.
//
// It also has to survive being navigated away from: activating the relay
// bookmarklet takes the operator to their Jira tab and back.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Beside the workspace document, in the operator's own profile.
 *
 * Overridable by JIRAPLUS_DRAFT_PATH so two test suites do not race each other
 * over one file - which they did, producing a suite that passed alone and failed
 * in the full run. A flake nobody can reproduce is worse than a failure.
 */
const DRAFT_FILE_PATH =
  process.env.JIRAPLUS_DRAFT_PATH ||
  path.join(process.env.APPDATA || os.homedir(), 'JiraPlus', 'authoring-draft.json');

/**
 * Reads the stored draft.
 *
 * Absent is the normal first state, not an error: nobody has written anything
 * yet. Unreadable is treated the same way — a corrupt file must not stop
 * somebody starting a new draft, and there is nothing in it worth recovering
 * that they cannot retype faster than they could be told about it.
 */
function readDraft() {
  try {
    return JSON.parse(fs.readFileSync(DRAFT_FILE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes the draft, creating the profile directory on first save. */
function writeDraft(draft) {
  fs.mkdirSync(path.dirname(DRAFT_FILE_PATH), { recursive: true });
  fs.writeFileSync(DRAFT_FILE_PATH, JSON.stringify(draft, null, 2), 'utf8');
}

/**
 * Discards the draft.
 *
 * Called deliberately by the operator, and automatically on a create or save
 * that fully succeeded — only on FULL success, so a partly-failed write never
 * takes the work with it.
 */
function discardDraft() {
  try {
    fs.unlinkSync(DRAFT_FILE_PATH);
  } catch {
    // Already gone is the outcome we wanted.
  }
}

export { DRAFT_FILE_PATH, discardDraft, readDraft, writeDraft };
