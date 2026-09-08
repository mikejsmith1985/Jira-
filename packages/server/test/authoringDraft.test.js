// authoringDraft.test.js — The routes that keep what somebody is writing.
//
// A draft is a paragraph somebody just wrote. It has to survive a page reload, a
// restart of the application, and being navigated away from — activating the
// relay bookmarklet takes the operator to their Jira tab and back, which is the
// case browser storage handles worst.
//
// The two states asserted hardest are the boring ones. An absent draft is the
// NORMAL FIRST STATE, not an error, and a screen that has to interpret a 404 to
// discover that will one day show the 404. And discarding happens only on a
// write that fully succeeded, because a partly-failed create that also deleted
// the draft loses work at the exact moment somebody most needs it back.

import fs from 'node:fs';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { DRAFT_FILE_PATH, discardDraft, writeDraft } from '../services/draftStore.js';

/** Configuration reaching nowhere; nothing here touches Jira. */
const CONFIG = { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 0 };

/** A draft mid-sentence, as one actually looks. */
const DRAFT = {
  existingIssueKey: null,
  summary: 'Show enrolment status after a plan change',
  description: '',
  acceptanceCriteria: '',
  operatorNarrative: 'Jana says members ring in every time a plan changes.',
  projectKey: 'DENP',
  issueTypeId: '10001',
  fieldValues: {},
  sources: [{ sourceId: 's1', label: 'the brief', text: 'Members cannot see it.', addedAtIso: '2026-09-08T09:14:00.000Z' }],
  loadedFieldValues: null,
  updatedAtIso: '2026-09-08T09:14:00.000Z',
};

beforeEach(discardDraft);
afterEach(discardDraft);

describe('before anything has been written', () => {
  it('answers with no draft rather than an error', async () => {
    const response = await request(createApp(CONFIG)).get('/api/authoring/draft');

    expect(response.status).toBe(200);
    expect(response.body.draft).toBeNull();
  });
});

describe('keeping a draft', () => {
  it('survives being written and read back whole', async () => {
    const app = createApp(CONFIG);

    await request(app).put('/api/authoring/draft').send({ draft: DRAFT });
    const response = await request(app).get('/api/authoring/draft');

    expect(response.body.draft.summary).toBe('Show enrolment status after a plan change');
    expect(response.body.draft.sources).toHaveLength(1);
  });

  it('keeps the operator’s own words, which are theirs and not Jira’s', async () => {
    // The narrative is never written to Jira, but losing it loses why they were
    // writing the issue at all.
    const app = createApp(CONFIG);

    await request(app).put('/api/authoring/draft').send({ draft: DRAFT });

    expect((await request(app).get('/api/authoring/draft')).body.draft.operatorNarrative).toContain(
      'Jana',
    );
  });

  it('survives the process going away, because it is on disk', () => {
    // The restart case, and the relay-navigation case. Nothing in memory would
    // outlive either.
    writeDraft(DRAFT);

    expect(JSON.parse(fs.readFileSync(DRAFT_FILE_PATH, 'utf8')).summary).toBe(DRAFT.summary);
  });

  it('replaces the previous draft rather than accumulating drafts', async () => {
    const app = createApp(CONFIG);

    await request(app).put('/api/authoring/draft').send({ draft: DRAFT });
    await request(app).put('/api/authoring/draft').send({ draft: { ...DRAFT, summary: 'Second' } });

    expect((await request(app).get('/api/authoring/draft')).body.draft.summary).toBe('Second');
  });

  it('refuses a save carrying no draft, rather than storing nothing over something', async () => {
    const app = createApp(CONFIG);
    await request(app).put('/api/authoring/draft').send({ draft: DRAFT });

    const response = await request(app).put('/api/authoring/draft').send({});

    expect(response.status).toBe(400);
    expect((await request(app).get('/api/authoring/draft')).body.draft.summary).toBe(DRAFT.summary);
  });
});

describe('discarding', () => {
  it('removes it when the operator says so', async () => {
    const app = createApp(CONFIG);
    await request(app).put('/api/authoring/draft').send({ draft: DRAFT });

    await request(app).delete('/api/authoring/draft');

    expect((await request(app).get('/api/authoring/draft')).body.draft).toBeNull();
  });

  it('is untroubled by there being nothing to discard', async () => {
    const response = await request(createApp(CONFIG)).delete('/api/authoring/draft');

    expect(response.status).toBe(200);
  });
});
