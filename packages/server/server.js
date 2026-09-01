// server.js — Starts Jira+ on this machine.
//
// Each person runs their own copy against their own Jira credential. There is
// no hosted instance and nothing to provision, which is what makes the tool
// something one person can stand up in an afternoon rather than something that
// needs a request raising.

import { createApp } from './app.js';
import { isJiraConfigured, loadConfig } from './config/loader.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  const readiness = isJiraConfigured(config)
    ? `connected to ${config.baseUrl}`
    : 'not configured yet — open the app and add your Jira URL and token';

  console.log(`Jira+ is running at http://localhost:${config.port}`);
  console.log(`Jira: ${readiness}`);

  if (!config.isSslVerified) {
    console.log(
      'TLS verification is OFF. This is only appropriate behind a corporate proxy that ' +
        're-signs traffic; turn it back on as soon as you can.',
    );
  }
});
