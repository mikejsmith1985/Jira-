// bindHost.test.js — Jira+ listens to this machine and to nothing else.
//
// Two problems, one cause. `app.listen(port)` with no host binds every
// interface, which meant:
//
//   1. Windows Firewall prompted - "Do you want to allow public and private
//      networks to access this app?" - on a program that has no business on a
//      network at all. Loopback-only listeners are exempt from that prompt
//      entirely, so the right answer was never to click Allow.
//
//   2. More seriously, anyone on the corporate network who could reach port
//      5556 could use the proxy, and the proxy attaches the operator's Jira
//      personal access token to every request it forwards. A local-only tool
//      was quietly offering a credentialled Jira gateway to the building.
//
// So the host is 127.0.0.1, explicitly, and this suite exists to stop it
// silently going back - the symptom is a firewall dialog nobody connects to a
// missing argument, and the exposure has no symptom at all.

import { describe, expect, it } from 'vitest';

import { LOOPBACK_HOST, describeListenTarget } from '../services/instanceService.js';

describe('the interface the server binds', () => {
  it('is loopback', () => {
    expect(LOOPBACK_HOST).toBe('127.0.0.1');
  });

  it('is never the wildcard, which is what exposed the proxy', () => {
    expect(LOOPBACK_HOST).not.toBe('0.0.0.0');
    expect(LOOPBACK_HOST).not.toBe('::');
  });

  it('names both host and port when reporting where it is listening', () => {
    // The startup line is the only place somebody can SEE the binding, so it
    // has to say the host rather than just the port.
    const described = describeListenTarget(5556);

    expect(described).toContain('127.0.0.1');
    expect(described).toContain('5556');
  });
});
