// draftStore.test.js — Where work in progress lives, and how it fails.
//
// A draft is a paragraph somebody just wrote. It is kept on disk rather than in
// browser storage because browser storage fails silently — a private window,
// cleared site data, a browser told to block it — and what disappears is the
// thing they most wanted kept. The predecessor stores drafts there and carries a
// permanent banner warning that work may be lost; a banner is not a fix.
//
// Both failure paths below answer with "no draft" rather than throwing. Absent
// is the normal first state, and a corrupt file holds nothing worth recovering
// that could not be retyped faster than it could be explained.

import os from 'node:os';
import path from 'node:path';

// Set BEFORE the store is imported, because the path is resolved at module load.
// Without this the two draft suites share one file and race each other, which
// showed up as a suite that passed alone and failed in the full run.
process.env.JIRAPLUS_DRAFT_PATH = path.join(os.tmpdir(), 'jiraplus-test-draft-store.json');

import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DRAFT_FILE_PATH, discardDraft, readDraft, writeDraft } from '../services/draftStore.js';

/** A draft mid-sentence. */
const DRAFT = { summary: 'Show enrolment status', sources: [] };

beforeEach(discardDraft);
afterEach(discardDraft);

describe('before anything has been written', () => {
  it('reads as no draft rather than throwing', () => {
    expect(readDraft()).toBeNull();
  });
});

describe('keeping a draft', () => {
  it('survives the process going away, because it is on disk', () => {
    // The restart case, and the case where activating the relay navigates the
    // operator away and back. Nothing held in memory would outlive either.
    writeDraft(DRAFT);

    expect(readDraft().summary).toBe('Show enrolment status');
  });

  it('writes where the workspace document already lives', () => {
    // Asserted by path rather than by removing the directory and watching it
    // reappear: that directory also holds the operator's connection and
    // workspace configuration, and a test that deletes it destroys real setup.
    writeDraft(DRAFT);

    expect(fs.existsSync(DRAFT_FILE_PATH)).toBe(true);
    expect(path.basename(path.dirname(DRAFT_FILE_PATH))).toBe('JiraPlus');
  });
});

describe('when the stored file is unreadable', () => {
  it('reads as no draft rather than stopping somebody starting a new one', () => {
    fs.mkdirSync(path.dirname(DRAFT_FILE_PATH), { recursive: true });
    fs.writeFileSync(DRAFT_FILE_PATH, 'this is not json', 'utf8');

    expect(readDraft()).toBeNull();
  });
});

describe('discarding', () => {
  it('is untroubled by there being nothing to discard', () => {
    expect(() => discardDraft()).not.toThrow();
  });
});
