// restartService.js — Coming back up on the new version without being asked.
//
// The installer wrote the new version beside the old one and moved the pointer,
// and then said "restart Jira+" — sending somebody off to find the launcher.
// That is precisely the manual step this whole mechanism exists to remove,
// reappearing at the last moment.
//
// Doing it automatically has one specific hazard, and it is silent. Jira+ treats
// a port already in use as "the copy you wanted is already running" and bows out
// quietly — right when somebody double-clicks twice, fatal here. A new version
// started before the old one has released the port would exit without a word,
// leaving the machine on the old version with nothing on screen to say so.
//
// So the handover is done by a third party: a small script, run by the Windows
// scripting host, that outlives this process. It waits for this copy to stop
// answering, and only then starts the new one. Neither process can do that for
// itself — the one that must wait is the one that must exit.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Seconds the helper waits for this copy to release the port before giving up. */
const HANDOVER_TIMEOUT_SECONDS = 30;

/** How often the helper asks whether the old copy has gone. */
const HANDOVER_POLL_MS = 500;

/** Milliseconds to wait before exiting, so the HTTP reply reaches the browser. */
const RESTART_GRACE_MS = 400;

/** The helper's filename. Written to the temp folder, not beside the program. */
const HELPER_FILENAME = 'jiraplus-restart.vbs';

/** Escapes a string for a VBScript literal. Only the quote needs it. */
function quoteForVbs(text) {
  return String(text).replace(/"/g, '""');
}

/**
 * The script that performs the handover.
 *
 * It runs outside both copies of Jira+, because the process that has to wait for
 * the port is the same process that has to release it.
 */
function buildRestartScript({ payloadPath, port }) {
  return [
    "' jiraplus-restart.vbs - written by Jira+ when it installs an update.",
    "'",
    "' Waits for the running copy to stop, then starts the new one. Starting too",
    "' early is a silent failure: the new copy finds the port still in use, bows",
    "' out by design, and the machine stays on the old version.",
    '',
    'Option Explicit',
    '',
    `Const PORT = ${port}`,
    `Const PAYLOAD = "${quoteForVbs(payloadPath)}"`,
    `Const WAIT_SECONDS = ${HANDOVER_TIMEOUT_SECONDS}`,
    `Const POLL_MS = ${HANDOVER_POLL_MS}`,
    '',
    'Dim shell, attempt',
    'Set shell = CreateObject("WScript.Shell")',
    '',
    'For attempt = 1 To WAIT_SECONDS',
    '    If Not IsStillAnswering() Then Exit For',
    '    WScript.Sleep POLL_MS',
    'Next',
    '',
    "' Hidden, the way the launcher starts it. A console window appearing on its",
    "' own would look like something had gone wrong.",
    'shell.Run Chr(34) & PAYLOAD & Chr(34), 0, False',
    '',
    'Function IsStillAnswering()',
    '    Dim request',
    '    IsStillAnswering = False',
    '    On Error Resume Next',
    '    Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")',
    '    request.SetTimeouts 500, 500, 1000, 1000',
    '    request.Open "GET", "http://localhost:" & PORT & "/api/health", False',
    '    request.Send ""',
    '    If Err.Number = 0 And request.Status = 200 Then IsStillAnswering = True',
    '    Err.Clear',
    '    On Error GoTo 0',
    'End Function',
    '',
  ].join('\r\n');
}

/** Writes the helper where a temporary file belongs, never beside the program. */
function writeHelperScript(scriptText) {
  const helperPath = path.join(os.tmpdir(), HELPER_FILENAME);
  fs.writeFileSync(helperPath, scriptText, 'utf8');
  return helperPath;
}

/**
 * Starts the helper and forgets about it.
 *
 * Detached and unreferenced on purpose: it has to keep running after this
 * process is gone, which is the whole point of it.
 */
function launchHelper(command, helperPath) {
  const child = spawn(command, ['//B', '//Nologo', helperPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

/** Stops this copy, once the reply has had time to reach the browser. */
function stopThisCopy() {
  setTimeout(() => process.exit(0), RESTART_GRACE_MS);
}

/**
 * Hands over to the version that was just installed.
 *
 * Nothing stops until the successor is arranged. Exiting without one is the only
 * outcome worse than not restarting at all: it leaves somebody with nothing
 * running and no message explaining why.
 */
function scheduleRestart({
  payloadPath,
  port,
  writeScript = writeHelperScript,
  launch = launchHelper,
  stop = stopThisCopy,
}) {
  if (typeof payloadPath !== 'string' || payloadPath.length === 0) {
    return { isRestarting: false, reason: 'There is no installed version to restart into.' };
  }

  try {
    const helperPath = writeScript(buildRestartScript({ payloadPath, port }));
    launch('wscript.exe', helperPath);
  } catch (error) {
    return { isRestarting: false, reason: error.message };
  }

  stop();
  return { isRestarting: true, reason: null };
}

export {
  HANDOVER_POLL_MS,
  HANDOVER_TIMEOUT_SECONDS,
  HELPER_FILENAME,
  RESTART_GRACE_MS,
  buildRestartScript,
  scheduleRestart,
};
