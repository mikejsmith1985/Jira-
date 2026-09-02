// server.js — Starts Jira+ on this machine.
//
// Each person runs their own copy against their own Jira credential. There is
// no hosted instance and nothing to provision, which is what makes the tool
// something one person can stand up in an afternoon rather than something that
// needs a request raising.

import { createApp } from './app.js';
import { isJiraConfigured, loadConfig } from './config/loader.js';
import {
  LOOPBACK_HOST,
  describeListenTarget,
  describeStartupFailure,
} from './services/instanceService.js';

const config = loadConfig();
const app = createApp(config);

// The host is explicit. Without it Node binds every interface, which both
// triggers the Windows Firewall dialog and hands anyone on the network a
// Jira proxy carrying this operator's token.
const server = app.listen(config.port, LOOPBACK_HOST, () => {
  const readiness = isJiraConfigured(config)
    ? `connected to ${config.baseUrl}`
    : 'not configured yet — open the app and add your Jira URL and token';

  console.log(`Jira+ is running at ${describeListenTarget(config.port)}`);
  console.log('It listens on this machine only. Nothing else on the network can reach it.');
  console.log(`Jira: ${readiness}`);

  if (!config.isSslVerified) {
    console.log(
      'TLS verification is OFF. This is only appropriate behind a corporate proxy that ' +
        're-signs traffic; turn it back on as soon as you can.',
    );
  }
});

// Without this handler a second copy threw an unhandled EADDRINUSE and died -
// a hidden process crashing every time somebody double-clicked the shortcut
// twice, while the launcher found the FIRST copy listening and opened the
// browser anyway. It looked like it had worked, and something had still gone
// wrong.
//
// A port already in use means the thing the person wanted is already serving,
// so this copy says so and leaves quietly. Exit code 0, because from their
// point of view nothing failed.
server.on('error', (error) => {
  const described = describeStartupFailure(error, config.port);
  console.log(described.message);
  process.exit(described.isAlreadyRunning ? 0 : 1);
});
