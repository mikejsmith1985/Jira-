// proxy.test.js — The credential stays on this side of the wire.
//
// Integration layer, run against a stand-in Jira rather than the real one. Per
// Article V, a third-party system this project does not own is tested against
// recorded fixtures; this suite additionally uses a live local stub for the
// header assertions, because what is being proved is what LEAVES this process,
// which no recording can show.

import http from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { buildDownstreamPath } from '../routes/jiraProxy.js';
import { readJournal, resetJournalForTesting } from '../services/writeJournal.js';

/**
 * The stand-in credential these tests trace through the proxy.
 *
 * Deliberately low-entropy and self-describing. An earlier version read like a
 * real token and a secret scanner flagged the pull request - correctly, because
 * a high-entropy string assigned to a credential field is exactly what a leaked
 * one looks like. A fixture should not have to be investigated to be dismissed.
 *
 * The assertions only need a string they can prove never leaves the process, so
 * the shape of it carries no weight.
 */
const FAKE_TOKEN = 'not-a-real-token-for-tests-only';

/** Requests the stub Jira received, so the test can inspect what was actually sent. */
let receivedRequests = [];

/** The stub Jira instance. */
let stubServer;

/** Configuration pointed at the stub. */
let config;

beforeAll(async () => {
  const stub = express();
  stub.use(express.json());
  stub.all('*', (req, res) => {
    receivedRequests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
    });
    if (req.url.includes('boom')) {
      res.status(400).json({ errorMessages: ["Field 'cf[99999]' does not exist"] });
      return;
    }
    res.json({ issues: [], total: 0 });
  });

  stubServer = http.createServer(stub);
  await new Promise((resolve) => stubServer.listen(0, resolve));

  config = {
    baseUrl: `http://127.0.0.1:${stubServer.address().port}`,
    personalAccessToken: FAKE_TOKEN,
    isSslVerified: false,
    port: 0,
  };
});

afterAll(async () => {
  await new Promise((resolve) => stubServer.close(resolve));
});

beforeEach(() => {
  receivedRequests = [];
  resetJournalForTesting();
});

describe("buildDownstreamPath", () => {
  it('keeps the query string, because a JQL search is nothing without it', () => {
    const path = buildDownstreamPath('/jira-proxy/rest/api/2/search?jql=project%20%3D%20ENCUC');

    expect(path).toBe('/rest/api/2/search?jql=project%20%3D%20ENCUC');
  });
});

describe('the credential', () => {
  it('is attached to the upstream request as a Bearer token', async () => {
    await request(createApp(config)).get('/jira-proxy/rest/api/2/search?jql=project=ENCUC');

    expect(receivedRequests[0].authorization).toBe(`Bearer ${FAKE_TOKEN}`);
  });

  it('never appears in a successful response the browser receives', async () => {
    const response = await request(createApp(config)).get('/jira-proxy/rest/api/2/myself');

    expect(JSON.stringify(response.body)).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(response.headers)).not.toContain(FAKE_TOKEN);
  });

  it('never appears in an error response either', async () => {
    const response = await request(createApp(config)).get('/jira-proxy/rest/api/2/search?jql=boom');

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain(FAKE_TOKEN);
  });

  it('never appears in the health report, which says only whether one is present', async () => {
    const response = await request(createApp(config)).get('/api/health');

    expect(response.body.isJiraConfigured).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(FAKE_TOKEN);
  });
});

describe('when Jira is not configured', () => {
  it('says so rather than failing obscurely on the first request', async () => {
    const unconfigured = { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 0 };
    const response = await request(createApp(unconfigured)).get('/jira-proxy/rest/api/2/myself');

    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/not configured/i);
  });

  it('reports an example URL as unconfigured, not as a real instance', async () => {
    const placeholder = {
      baseUrl: 'https://jira.example.com',
      personalAccessToken: 'not-a-real-token-for-tests-only',
      isSslVerified: true,
      port: 0,
    };
    const response = await request(createApp(placeholder)).get('/api/health');

    expect(response.body.isJiraConfigured).toBe(false);
  });
});

describe('Jira own words reach the user', () => {
  it("passes Jira's error body through verbatim rather than paraphrasing it", async () => {
    const response = await request(createApp(config)).get('/jira-proxy/rest/api/2/search?jql=boom');

    expect(response.body.errorMessages).toEqual(["Field 'cf[99999]' does not exist"]);
  });
});

describe('reads are not journalled', () => {
  it('records nothing for a GET, because a read changes nothing', async () => {
    await request(createApp(config)).get('/jira-proxy/rest/api/2/search?jql=project=ENCUC');

    expect(readJournal()).toHaveLength(0);
  });
});
