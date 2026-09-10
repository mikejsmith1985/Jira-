// restartService.test.js — An update you still have to launch yourself is not an update.
//
// The installer did its job: the new version was written beside the old one and
// the pointer moved. Then it said "restart Jira+" and left somebody to go and
// find the launcher. That is the manual step this whole mechanism exists to
// remove, reappearing at the last moment.
//
// The hazard in doing it automatically is specific and silent. Jira+ treats a
// port already in use as "the copy you wanted is already there" and bows out
// quietly - correct behaviour when somebody double-clicks twice, fatal here. A
// new version started before the old one has released the port would exit
// without a word, leaving the machine on the old version and nothing on screen
// to say the restart had failed.
//
// So the handover waits for the old copy to stop answering BEFORE starting the
// new one, and it does that from outside both processes.

import { describe, expect, it, vi } from 'vitest';

import {
  HANDOVER_TIMEOUT_SECONDS,
  buildRestartScript,
  scheduleRestart,
} from '../services/restartService.js';

const PAYLOAD_PATH = 'C:\\Jira Plus\\versions\\0.9.2\\jiraplus.exe';
const PORT = 5556;

describe('the script that outlives this process', () => {
  it('starts the version that was just installed', () => {
    expect(buildRestartScript({ payloadPath: PAYLOAD_PATH, port: PORT })).toContain(PAYLOAD_PATH);
  });

  it('waits for the old copy to stop answering before starting the new one', () => {
    // Starting too early is the silent failure: the new copy finds the port in
    // use, bows out by design, and the machine stays on the old version.
    const script = buildRestartScript({ payloadPath: PAYLOAD_PATH, port: PORT });

    expect(script).toContain(String(PORT));
    expect(script.indexOf('IsStillAnswering')).toBeLessThan(script.indexOf('shell.Run'));
  });

  it('gives up waiting rather than hanging forever', () => {
    expect(buildRestartScript({ payloadPath: PAYLOAD_PATH, port: PORT })).toContain(
      String(HANDOVER_TIMEOUT_SECONDS),
    );
  });

  it('starts it hidden, the way the launcher does', () => {
    // A console window appearing on its own would look like something went wrong.
    expect(buildRestartScript({ payloadPath: PAYLOAD_PATH, port: PORT })).toMatch(
      /shell\.Run.*, 0, False/,
    );
  });

  it('survives a quote in the path rather than producing a broken script', () => {
    const script = buildRestartScript({ payloadPath: 'C:\\a"b\\jiraplus.exe', port: PORT });

    expect(script).toContain('C:\\a""b\\jiraplus.exe');
  });
});

describe('handing over', () => {
  /** Records what the handover did, without starting anything. */
  function buildSpies() {
    return { writeScript: vi.fn(), launch: vi.fn(async () => {}), stop: vi.fn() };
  }

  it('writes the script, launches it detached, then stops this copy', async () => {
    const spies = buildSpies();

    const outcome = await scheduleRestart({ payloadPath: PAYLOAD_PATH, port: PORT, ...spies });

    expect(outcome.isRestarting).toBe(true);
    expect(spies.writeScript).toHaveBeenCalledOnce();
    expect(spies.launch).toHaveBeenCalledOnce();
    expect(spies.stop).toHaveBeenCalledOnce();
  });

  it('runs the helper through wscript, so no console window appears', async () => {
    const spies = buildSpies();

    await scheduleRestart({ payloadPath: PAYLOAD_PATH, port: PORT, ...spies });

    expect(spies.launch.mock.calls[0][0]).toMatch(/wscript/i);
  });

  it('names wscript by its full path rather than trusting PATH', async () => {
    // The packaged program is started by the Windows scripting host from a
    // double-clicked .vbs, and what it inherits is not this shell's. A lookup
    // that fails there fails at the one moment nobody is watching.
    const spies = buildSpies();

    await scheduleRestart({ payloadPath: PAYLOAD_PATH, port: PORT, ...spies });

    expect(spies.launch.mock.calls[0][0]).toMatch(/^[A-Za-z]:\\.+\\wscript\.exe$/i);
  });

  it('refuses when there is nothing to restart into, and does NOT stop this copy', async () => {
    // Stopping without a successor is the one outcome worse than not restarting:
    // it leaves somebody with nothing running and no message.
    const spies = buildSpies();

    const outcome = await scheduleRestart({ payloadPath: null, port: PORT, ...spies });

    expect(outcome.isRestarting).toBe(false);
    expect(spies.stop).not.toHaveBeenCalled();
    expect(spies.launch).not.toHaveBeenCalled();
  });

  it('WAITS for the helper to actually start before stopping anything', async () => {
    // The defect this replaces. spawn() reports a missing program on a later
    // tick, never by throwing, so a try/catch around it cannot see the failure -
    // the handover reported success and then killed the server anyway, leaving
    // nothing running and no way to know why. Somebody then restarts by hand,
    // which is the whole thing this was supposed to end.
    const spies = buildSpies();
    spies.launch.mockRejectedValue(new Error('wscript.exe could not be started'));

    const outcome = await scheduleRestart({ payloadPath: PAYLOAD_PATH, port: PORT, ...spies });

    expect(outcome.isRestarting).toBe(false);
    expect(outcome.reason).toContain('wscript.exe could not be started');
    expect(spies.stop).not.toHaveBeenCalled();
  });
});
