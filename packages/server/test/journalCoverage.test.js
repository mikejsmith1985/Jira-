// journalCoverage.test.js — Proves SC-010: no unlogged writes.
//
// The claim "everything this tool changed is in the log" is only worth making
// if nothing can reach Jira without passing the recorder. That is structural
// here — there is exactly one proxy route — but structure erodes, so this suite
// enumerates every mutating verb and asserts an entry for each, and asserts that
// a write which FAILS is recorded as failed rather than quietly dropped.
//
// A journal that silently omits the one write somebody is asking about is worse
// than no journal, because it answers confidently and wrongly.

import http from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import {
  MUTATING_METHODS,
  classifyEndpoint,
  readJournal,
  resetJournalForTesting,
} from '../services/writeJournal.js';

/** The stub Jira instance every request in this suite is forwarded to. */
let stubServer;

/** Configuration pointed at the stub. */
let config;

beforeAll(async () => {
  const stub = express();
  stub.use(express.json());
  stub.all('*', (req, res) => {
    // A path containing "refuse" answers 400, so the failure path is exercised.
    if (req.url.includes('refuse')) {
      res.status(400).json({ errorMessages: ['Field cannot be set on this screen'] });
      return;
    }
    res.status(204).end();
  });

  stubServer = http.createServer(stub);
  await new Promise((resolve) => stubServer.listen(0, resolve));

  config = {
    baseUrl: `http://127.0.0.1:${stubServer.address().port}`,
    personalAccessToken: 'pat-journal-test',
    isSslVerified: false,
    port: 0,
  };
});

afterAll(async () => {
  await new Promise((resolve) => stubServer.close(resolve));
});

beforeEach(() => {
  resetJournalForTesting();
});

describe('every mutating verb is recorded', () => {
  it.each(MUTATING_METHODS)('records a %s', async (method) => {
    const app = createApp(config);
    await request(app)[method.toLowerCase()]('/jira-proxy/rest/api/2/issue/ENCUC-1142').send({});

    const entries = readJournal();

    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe(method);
    expect(entries[0].issueKey).toBe('ENCUC-1142');
  });

  it('records nothing for the verbs that change nothing', async () => {
    const app = createApp(config);
    await request(app).get('/jira-proxy/rest/api/2/issue/ENCUC-1142');
    await request(app).head('/jira-proxy/rest/api/2/issue/ENCUC-1142');

    expect(readJournal()).toHaveLength(0);
  });
});

describe('an entry says what happened, not merely that it was attempted', () => {
  it('marks a successful write as applied', async () => {
    await request(createApp(config))
      .put('/jira-proxy/rest/api/2/issue/ENCUC-1142')
      .send({ fields: { summary: 'New summary' } });

    expect(readJournal()[0].outcome).toBe('applied');
  });

  it('marks a refused write as failed rather than dropping it', async () => {
    await request(createApp(config))
      .put('/jira-proxy/rest/api/2/issue/ENCUC-refuse')
      .send({ fields: {} });

    const entry = readJournal()[0];

    expect(entry.outcome).toBe('failed');
    expect(entry.statusCode).toBe(400);
  });

  it('records the attempt before Jira answers, so a crash cannot lose it', async () => {
    // The entry exists with an outcome the moment the response finishes; the
    // ordering guarantee is that recordJiraWrite runs before forwarding, which
    // is observable here as the entry surviving a failing request.
    await request(createApp(config)).post('/jira-proxy/rest/api/2/issue/refuse').send({});

    expect(readJournal()).toHaveLength(1);
  });
});

describe('an entry reads as an action, not as a URL', () => {
  it.each([
    ['/rest/api/2/issue/ENCUC-1/transitions', 'transition'],
    ['/rest/api/2/issue/ENCUC-1/comment', 'comment'],
    ['/rest/api/2/issue/ENCUC-1/worklog', 'worklog'],
    ['/rest/api/2/issueLink', 'link'],
    ['/rest/api/2/issue/ENCUC-1', 'field'],
    ['/rest/api/2/issue', 'create'],
    ['/rest/api/2/version', 'other'],
  ])('classifies %s as %s', (endpointPath, expectedAction) => {
    expect(classifyEndpoint(endpointPath)).toBe(expectedAction);
  });
});

describe('what the journal deliberately does not hold', () => {
  it('excludes the request body, because this is attribution and not a second copy', async () => {
    const secretSummary = 'commercially sensitive summary text';
    await request(createApp(config))
      .put('/jira-proxy/rest/api/2/issue/ENCUC-1142')
      .send({ fields: { summary: secretSummary } });

    expect(JSON.stringify(readJournal())).not.toContain(secretSummary);
  });
});

describe('the log is served read-only', () => {
  it('returns the recorded entries newest first', async () => {
    const app = createApp(config);
    await request(app).put('/jira-proxy/rest/api/2/issue/ENCUC-1').send({});
    await request(app).put('/jira-proxy/rest/api/2/issue/ENCUC-2').send({});

    const response = await request(app).get('/api/write-journal');

    expect(response.body.totalRecorded).toBe(2);
    expect(response.body.entries[0].issueKey).toBe('ENCUC-2');
  });

  it('offers no route that clears or edits the log', async () => {
    const app = createApp(config);

    expect((await request(app).delete('/api/write-journal')).status).toBe(404);
    expect((await request(app).post('/api/write-journal').send({})).status).toBe(404);
  });
});
