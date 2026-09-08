// relayBridge.test.js — Reaching Jira with no token, through the browser you already trust.
//
// Every version of Jira+ so far has opened by demanding a personal access token,
// and setup has been the worst part of every session. The relay removes the
// demand entirely rather than making it easier: a bookmarklet clicked on a Jira
// tab executes `fetch(..., {credentials:"include"})` INSIDE that tab, so the
// credential is the session cookie the browser already holds. Jira+ never sees
// it, never stores it, and there is nothing to paste or revoke.
//
// The bridge is only a message queue between the two: Jira+ posts a request, the
// bookmarklet long-polls for it, executes it on the Jira origin, and posts the
// answer back. Everything below is about that queue behaving when the browser
// tab does what browser tabs do - close, navigate away, reload, come back.
//
// NodeToolbox proved this pattern against ServiceNow. Jira was listed among its
// supported systems and no bookmarklet was ever written for it, so this is the
// piece that was missing rather than a new idea.

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { resetRelayState } from '../routes/relayBridge.js';

/** Configuration with no credential at all — the state this feature exists to make workable. */
const CONFIG = { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 0 };

afterEach(resetRelayState);

describe('before any bookmarklet has been clicked', () => {
  it('reports itself disconnected rather than absent', async () => {
    const response = await request(createApp(CONFIG)).get('/api/relay/status');

    expect(response.status).toBe(200);
    expect(response.body.isConnected).toBe(false);
  });

  it('refuses a relayed request instead of queueing one nothing will ever execute', async () => {
    // Queueing silently would leave the caller waiting thirty seconds for a tab
    // that was never open. The refusal names the fix.
    const response = await request(createApp(CONFIG))
      .post('/api/relay/request')
      .send({ id: 'r1', method: 'GET', path: '/rest/api/2/myself' });

    expect(response.status).toBe(503);
    expect(response.body.reason).toMatch(/bookmarklet/i);
  });
});

describe('registering', () => {
  it('records who Jira says the browser is signed in as', async () => {
    // This is the evidence that replaces "did my token work?". The bookmarklet
    // asks Jira /myself in the page and reports the answer, so the relay is
    // proven end to end at the moment it connects rather than on first use.
    const app = createApp(CONFIG);

    await request(app)
      .post('/api/relay/register')
      .send({ origin: 'https://jira.example.org', displayName: 'Smith, Michael (CTR)' });

    const status = await request(app).get('/api/relay/status');

    expect(status.body.isConnected).toBe(true);
    expect(status.body.displayName).toBe('Smith, Michael (CTR)');
    expect(status.body.origin).toBe('https://jira.example.org');
  });

  it('allows the bookmarklet to reach it from the Jira origin', async () => {
    // The bookmarklet runs on https://jira.example.org and calls http://127.0.0.1.
    // Corporate Chrome treats that as private-network access and blocks it
    // outright unless the response says otherwise.
    const response = await request(createApp(CONFIG)).options('/api/relay/register');

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-private-network']).toBe('true');
  });
});

describe('carrying one request across', () => {
  it('hands a queued request to the bookmarklet when it polls', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    await request(app)
      .post('/api/relay/request')
      .send({ id: 'r1', method: 'GET', path: '/rest/api/2/myself' });
    const polled = await request(app).get('/api/relay/poll');

    expect(polled.body.request.id).toBe('r1');
    expect(polled.body.request.path).toBe('/rest/api/2/myself');
  });

  it('returns the answer from the bookmarklet to the caller waiting on it', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });
    await request(app).post('/api/relay/request').send({ id: 'r1', method: 'GET', path: '/x' });

    await request(app)
      .post('/api/relay/result')
      .send({ id: 'r1', ok: true, status: 200, data: '{"key":"ENCUC-1"}' });
    const collected = await request(app).get('/api/relay/result/r1');

    expect(collected.body.result.status).toBe(200);
    expect(collected.body.result.data).toBe('{"key":"ENCUC-1"}');
  });

  it('does not hand the same request to two pollers', async () => {
    // A second tab with the bookmarklet running would otherwise execute
    // everything twice - which for a write is not a duplicate, it is a defect.
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });
    await request(app).post('/api/relay/request').send({ id: 'r1', method: 'GET', path: '/x' });

    const first = await request(app).get('/api/relay/poll');
    const second = await request(app).get('/api/relay/poll?timeoutMs=1');

    expect(first.body.request.id).toBe('r1');
    expect(second.body.request).toBeNull();
  });
});

describe('when the far side refuses', () => {
  it('records a 401 so the connection does not keep reporting itself healthy', async () => {
    // The tab polling proves the browser is alive. It proves nothing about
    // whether Jira will still talk to us - a dropped VPN leaves the tab happily
    // polling while every call comes back 401.
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });
    await request(app).post('/api/relay/request').send({ id: 'r1', method: 'GET', path: '/x' });

    await request(app).post('/api/relay/result').send({ id: 'r1', ok: false, status: 401 });
    const status = await request(app).get('/api/relay/status');

    expect(status.body.isAuthorized).toBe(false);
  });

  it('treats a channel that has never been refused as authorised', async () => {
    // Reporting a fresh relay as unauthorised would be its own false alarm.
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    expect((await request(app).get('/api/relay/status')).body.isAuthorized).toBe(true);
  });
});

describe('when the tab goes away', () => {
  it('reports disconnected after deregistering', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    await request(app).post('/api/relay/deregister');

    expect((await request(app).get('/api/relay/status')).body.isConnected).toBe(false);
  });

  it('discards a queued request rather than serving it to a later tab', async () => {
    // A request queued before the tab closed is stale by the time another one
    // opens, and executing it then is a surprise write nobody asked for.
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });
    await request(app).post('/api/relay/request').send({ id: 'r1', method: 'GET', path: '/x' });

    await request(app).post('/api/relay/deregister');
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });
    const polled = await request(app).get('/api/relay/poll?timeoutMs=1');

    expect(polled.body.request).toBeNull();
  });
});

describe('the bookmarklet itself', () => {
  it('is served with the port this server is actually on', async () => {
    // Hardcoding the port in the client is how somebody ends up with a
    // bookmarklet in their bar that points at the wrong copy for months.
    const response = await request(createApp({ ...CONFIG, port: 5556 })).get(
      '/api/relay/bookmarklet',
    );

    expect(response.body.code).toContain('127.0.0.1:5556');
  });

  it('is a javascript: url, so it can be dragged to a bookmarks bar', async () => {
    const response = await request(createApp(CONFIG)).get('/api/relay/bookmarklet');

    expect(response.body.code.startsWith('javascript:')).toBe(true);
  });

  it('sends the header Jira requires on writes', async () => {
    // Jira Data Center rejects a cookie-authenticated POST without
    // X-Atlassian-Token: no-check as XSRF. Every write would fail, and the
    // message Jira returns does not say why.
    const response = await request(createApp(CONFIG)).get('/api/relay/bookmarklet');

    expect(response.body.code).toContain('X-Atlassian-Token');
  });

  it('proves it is on a Jira page by asking Jira who the user is', async () => {
    // A hostname test cannot work: this instance is at
    // jira.healthspring-jira-prod.aws.zilverton.com and the next one will be
    // somewhere else. Asking /myself proves the page AND the session at once.
    const response = await request(createApp(CONFIG)).get('/api/relay/bookmarklet');

    expect(response.body.code).toContain('/rest/api/2/myself');
  });
});

describe('reaching Jira with no token at all', () => {
  // The point of the whole feature. An installation that has never been given a
  // credential is fully working the moment a Jira tab is relaying, and every
  // existing surface reaches Jira through the SAME proxy it always used - which
  // is what keeps one door to Jira, and the write journal impossible to bypass.

  /**
   * Plays the bookmarklet for one request.
   *
   * The poll is started FIRST and left waiting, because that is the real
   * sequence: a tab is already polling when somebody presses Run. Starting the
   * proxy call first would leave this racing the queue.
   */
  async function relayOneCall(app, startProxiedCall, reply) {
    const polling = request(app).get('/api/relay/poll').then((response) => response);
    const proxied = startProxiedCall().then((response) => response);

    const polled = await polling;
    await request(app)
      .post('/api/relay/result')
      .send({ id: polled.body.request.id, ...reply });

    return { executed: polled.body.request, response: await proxied };
  }

  it('forwards a proxied call through the browser when no token is configured', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    const { executed, response } = await relayOneCall(
      app,
      () => request(app).get('/jira-proxy/rest/api/2/myself'),
      { ok: true, status: 200, data: '{"displayName":"Smith, Michael (CTR)"}' },
    );

    expect(executed.path).toBe('/rest/api/2/myself');
    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe('Smith, Michael (CTR)');
  });

  it('carries the query string, without which a JQL search is nothing', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    const { executed } = await relayOneCall(
      app,
      () => request(app).get('/jira-proxy/rest/api/2/search?jql=project%3DENCUC'),
      { ok: true, status: 200, data: '{"total":0}' },
    );

    expect(executed.path).toContain('jql=project%3DENCUC');
  });

  it('passes a write body through, so applying a fix works with no token', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    const { executed } = await relayOneCall(
      app,
      () =>
        request(app)
          .put('/jira-proxy/rest/api/2/issue/ENCUC-1')
          .send({ fields: { summary: 'Renamed' } }),
      { ok: true, status: 204, data: null },
    );

    expect(executed.method).toBe('PUT');
    expect(executed.body.fields.summary).toBe('Renamed');
  });

  it('reports Jira’s own status rather than flattening it to a success', async () => {
    const app = createApp(CONFIG);
    await request(app).post('/api/relay/register').send({ origin: 'https://jira.example.org' });

    const { response } = await relayOneCall(
      app,
      () => request(app).get('/jira-proxy/rest/api/2/search?jql=bad'),
      {
        ok: false,
        status: 400,
        data: '{"errorMessages":["Field \'nope\' does not exist."]}',
      },
    );

    expect(response.status).toBe(400);
    expect(response.body.errorMessages[0]).toMatch(/does not exist/);
  });
});
