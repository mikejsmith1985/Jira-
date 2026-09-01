// instanceService.js — Which copy is running, and how to stop it.
//
// Jira+ starts hidden so no console window flashes up, which is right, but it
// left no way out except Task Manager and no way to tell one copy from another.
//
// It also had no handler on `listen`, so a second copy threw an unhandled
// EADDRINUSE and died. The launcher then polled the port, found the FIRST copy
// listening, and opened the browser — so it looked like it worked while leaving
// a crashed process behind on every second double-click.
//
// That case is not an error. The port already serving means the thing the person
// wanted is already there, so the second copy bows out quietly and the browser
// opens on the copy that is running.

/** When this process began serving. Fixed at import, which is close enough. */
const STARTED_AT_ISO = new Date().toISOString();

/** Milliseconds to wait after answering a stop request before exiting. */
const STOP_GRACE_MS = 250;

/**
 * Describes a failure to bind the port.
 *
 * EADDRINUSE is singled out because it is the one failure that is not a
 * failure: another copy is already serving, which is what the person wanted.
 * Anything else is a real problem and must not be swallowed as "already
 * running", or somebody is sent to a browser tab that never loads.
 */
function describeStartupFailure(error, port) {
  if (error?.code === 'EADDRINUSE') {
    return {
      isAlreadyRunning: true,
      message:
        `Jira+ is already running on port ${port}. ` +
        `Opening that copy instead of starting a second one.`,
    };
  }

  return {
    isAlreadyRunning: false,
    message: `Jira+ could not listen on port ${port}: ${error?.code ?? error?.message ?? 'unknown error'}.`,
  };
}

/** What this copy is, so a person can match a browser tab to a process. */
function describeInstance(config) {
  return {
    processId: process.pid,
    port: config.port,
    startedAtIso: STARTED_AT_ISO,
  };
}

/**
 * Stops this process, after the caller has been answered.
 *
 * The delay exists so the HTTP reply actually reaches the browser. Exiting first
 * makes a successful stop indistinguishable from a broken button.
 */
function scheduleStop(isDeferred) {
  if (isDeferred) return;
  setTimeout(() => process.exit(0), STOP_GRACE_MS);
}

export { STARTED_AT_ISO, STOP_GRACE_MS, describeInstance, describeStartupFailure, scheduleStop };
