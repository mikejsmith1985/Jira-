// instanceService.test.js — Knowing which copy is running, and being able to stop it.
//
// Jira+ starts hidden, so there is no window to close and Task Manager was the
// only way out. Worse, `app.listen` had no error handler: starting a second copy
// threw an unhandled EADDRINUSE and the process died — a hidden process crashing
// every time somebody double-clicked the shortcut twice.
//
// The launcher then polled the port, found the FIRST instance listening, and
// opened the browser. So it looked like it had worked while leaving a crash
// behind, which is the worst of both outcomes: nothing visibly wrong, and
// something actually wrong.
//
// Two answers. A second launch is not an error at all — the port is already
// serving the thing the person wanted, so the right behaviour is to bow out
// quietly rather than crash. And the running copy names itself, so "which one am
// I looking at?" has an answer on screen instead of in Task Manager.

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { describeStartupFailure } from '../services/instanceService.js';

/** Configuration pointed nowhere; nothing in this suite reaches Jira. */
const CONFIG = { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 5556 };

describe('identifying the running copy', () => {
  it('reports its own process id, so it can be found and stopped', async () => {
    const response = await request(createApp(CONFIG)).get('/api/instance');

    expect(response.status).toBe(200);
    expect(response.body.processId).toBe(process.pid);
  });

  it('reports the port it is serving, so the browser tab can be matched to it', async () => {
    const response = await request(createApp(CONFIG)).get('/api/instance');

    expect(response.body.port).toBe(5556);
  });

  it('reports when it started, so an old forgotten copy is recognisable', async () => {
    const response = await request(createApp(CONFIG)).get('/api/instance');

    expect(Date.parse(response.body.startedAtIso)).not.toBeNaN();
  });
});

describe('a second copy starting', () => {
  it('is described as another copy already running, not as a crash', () => {
    // EADDRINUSE here means the thing the person wanted is ALREADY SERVING. That
    // is a success from their point of view, and reporting it as a failure is
    // what produced an unexplained popup on every second double-click.
    const described = describeStartupFailure({ code: 'EADDRINUSE' }, 5556);

    expect(described.isAlreadyRunning).toBe(true);
    expect(described.message).toMatch(/already running/i);
    expect(described.message).toContain('5556');
  });

  it('does not treat an unrelated failure as an existing instance', () => {
    // A permissions failure needs a real error. Swallowing it as "already
    // running" would send somebody to a browser tab that never loads.
    const described = describeStartupFailure({ code: 'EACCES' }, 5556);

    expect(described.isAlreadyRunning).toBe(false);
  });

  it('names the port in an unrelated failure too, since that is what was refused', () => {
    expect(describeStartupFailure({ code: 'EACCES' }, 5556).message).toContain('5556');
  });
});

describe('stopping from the interface', () => {
  it('accepts the request before the process goes away, so the reply arrives', async () => {
    // Answering after exit means the browser reports a network error and the
    // person cannot tell a successful stop from a broken button.
    const response = await request(createApp({ ...CONFIG, isStopDeferred: true })).post(
      '/api/instance/stop',
    );

    expect(response.status).toBe(200);
    expect(response.body.isStopping).toBe(true);
  });
});
