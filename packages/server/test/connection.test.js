// connection.test.js — Setting the one credential, without ever handing it back.
//
// Jira+ shipped able to READ its Jira address and token and unable to SET them.
// `saveConfig` existed in the loader and nothing called it: no route, no screen.
// The result started, served its interface, and could not be pointed at a Jira,
// which is indistinguishable from broken for the person trying to use it.
//
// The asymmetry these tests pin down is the important part. The base URL is
// readable, because a screen has to show which Jira it is talking to and a
// person comparing two installations needs to see it. The token is never
// readable by anything, including the browser that just set it — only whether
// one is present. A route that echoes a credential back turns every future
// screenshot, cache and log into a place the token now lives.

import fs from 'node:fs';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { CONFIG_FILE_PATH } from '../config/loader.js';

/** A token shaped like nothing real, so a scanner has no reason to look twice. */
const TEST_TOKEN = 'not-a-real-token-for-tests-only';

/** Removes any document left by a previous run. */
function clearStoredConfig() {
  try {
    fs.unlinkSync(CONFIG_FILE_PATH);
  } catch {
    // Absent is the expected state on a first run.
  }
}

beforeEach(clearStoredConfig);
afterEach(clearStoredConfig);

/** A live configuration object, held by reference exactly as the server holds it. */
function buildConfig() {
  return { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 0 };
}

describe('reading the connection', () => {
  it('reports an unconfigured installation as unconfigured, not as an error', async () => {
    const response = await request(createApp(buildConfig())).get('/api/connection');

    expect(response.status).toBe(200);
    expect(response.body.baseUrl).toBe('');
    expect(response.body.isTokenPresent).toBe(false);
    expect(response.body.isJiraConfigured).toBe(false);
  });

  it('never returns the token, only whether one is present', async () => {
    const config = buildConfig();
    const app = createApp(config);

    await request(app)
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org', personalAccessToken: TEST_TOKEN });

    const response = await request(app).get('/api/connection');

    expect(response.body.isTokenPresent).toBe(true);
    // The whole body, not just the field it would obviously live in: a token
    // that leaks does so through the field nobody thought to check.
    expect(JSON.stringify(response.body)).not.toContain(TEST_TOKEN);
  });
});

describe('saving the connection', () => {
  it('persists the address and token so a restart keeps them', async () => {
    await request(createApp(buildConfig()))
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org', personalAccessToken: TEST_TOKEN });

    const stored = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));

    expect(stored.baseUrl).toBe('https://jira.example.org');
    expect(stored.personalAccessToken).toBe(TEST_TOKEN);
  });

  it('takes effect immediately, without a restart', async () => {
    // The server holds its configuration by reference precisely so that saving a
    // credential changes the NEXT request rather than the next launch. A person
    // who has to restart after setup will read that as the save having failed.
    const config = buildConfig();
    const app = createApp(config);

    await request(app)
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org', personalAccessToken: TEST_TOKEN });

    expect(config.baseUrl).toBe('https://jira.example.org');
    expect(config.personalAccessToken).toBe(TEST_TOKEN);
    expect((await request(app).get('/api/health')).body.isJiraConfigured).toBe(true);
  });

  it('strips a trailing slash, so a pasted address cannot produce a double slash', async () => {
    const config = buildConfig();

    await request(createApp(config))
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org/', personalAccessToken: TEST_TOKEN });

    expect(config.baseUrl).toBe('https://jira.example.org');
  });

  it('keeps the stored token when a save omits it', async () => {
    // Editing the address on a screen that cannot show the token must not wipe
    // the token. An empty field there means "unchanged", never "clear it".
    const config = buildConfig();
    const app = createApp(config);

    await request(app)
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org', personalAccessToken: TEST_TOKEN });
    await request(app).put('/api/connection').send({ baseUrl: 'https://jira.example.net' });

    expect(config.baseUrl).toBe('https://jira.example.net');
    expect(config.personalAccessToken).toBe(TEST_TOKEN);
  });

  it('refuses an address that is not http or https', async () => {
    const response = await request(createApp(buildConfig()))
      .put('/api/connection')
      .send({ baseUrl: 'jira.example.org', personalAccessToken: TEST_TOKEN });

    expect(response.status).toBe(400);
    expect(response.body.reason).toMatch(/https?/i);
  });

  it('refuses the example address, so a placeholder cannot look configured', async () => {
    const response = await request(createApp(buildConfig()))
      .put('/api/connection')
      .send({ baseUrl: 'https://your-jira.example.com', personalAccessToken: TEST_TOKEN });

    expect(response.status).toBe(400);
  });
});

describe('the port', () => {
  it('defaults away from the port the predecessor occupies', async () => {
    // NodeToolbox listens on 5555. Jira+ exists to be compared against it, which
    // is impossible if only one of them can run. The two are meant to be open
    // side by side.
    const { DEFAULT_PORT } = await import('../config/loader.js');

    expect(DEFAULT_PORT).not.toBe(5555);
  });

  it('is saved as a number so a restart honours it', async () => {
    const config = buildConfig();

    await request(createApp(config))
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org', personalAccessToken: TEST_TOKEN, port: 5601 });

    expect(JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8')).port).toBe(5601);
  });

  it('refuses a port outside the range a machine can actually listen on', async () => {
    const response = await request(createApp(buildConfig()))
      .put('/api/connection')
      .send({ baseUrl: 'https://jira.example.org', personalAccessToken: TEST_TOKEN, port: 99999 });

    expect(response.status).toBe(400);
  });
});
