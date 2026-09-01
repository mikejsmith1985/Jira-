// loader.js — Where the one credential lives, and how it is read.
//
// Jira+ needs exactly one credential: a Jira personal access token. It is held
// in a file under the user profile directory, never in the repository and never
// served to the browser. Environment variables override the file so a machine
// can be configured without opening the app.
//
// The predecessor asked for Jira, Confluence, GitHub and ServiceNow credentials
// before anything worked, and that setup friction was a principal reason it went
// unused. There is deliberately nothing else here.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Filename of the configuration document inside the profile directory. */
const CONFIG_FILENAME = 'jiraplus.json';

/** Directory that survives reinstalling or moving the application. */
const CONFIG_DIRECTORY = path.join(process.env.APPDATA || os.homedir(), 'JiraPlus');

/** Absolute path to the configuration document. */
const CONFIG_FILE_PATH = path.join(CONFIG_DIRECTORY, CONFIG_FILENAME);

/** Port the local server listens on when nothing else is specified. */
const DEFAULT_PORT = 5555;

/** Substrings that mean the base URL is still the example, not a real instance. */
const PLACEHOLDER_URL_FRAGMENTS = ['example.com', 'your-instance', 'your-jira'];

/**
 * Reads the configuration document, returning an empty object when it does not
 * exist yet. A missing file is the normal first-run state, not an error.
 */
function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Strips a trailing slash so path joining never produces a double slash. */
function normaliseBaseUrl(baseUrl) {
  return typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';
}

/**
 * Loads the effective configuration: the file first, then any environment
 * variable that overrides it.
 *
 * @returns {{baseUrl: string, personalAccessToken: string, isSslVerified: boolean, port: number}}
 */
function loadConfig() {
  const stored = readConfigFile();
  return {
    baseUrl: normaliseBaseUrl(process.env.JIRA_BASE_URL || stored.baseUrl || ''),
    personalAccessToken: process.env.JIRA_PAT || stored.personalAccessToken || '',
    // Lowered only for corporate proxies that re-sign TLS traffic. Anything
    // other than the literal "false" leaves verification on.
    isSslVerified: (process.env.TBX_SSL_VERIFY || stored.sslVerify || 'true') !== 'false',
    port: Number(process.env.PORT || stored.port || DEFAULT_PORT),
  };
}

/**
 * Is Jira configured well enough to talk to?
 *
 * Reported honestly rather than assumed, so the first screen can say what is
 * missing instead of failing on the first request.
 */
function isJiraConfigured(config) {
  if (config.baseUrl.length === 0 || config.personalAccessToken.length === 0) return false;
  return !PLACEHOLDER_URL_FRAGMENTS.some((fragment) => config.baseUrl.includes(fragment));
}

/**
 * Writes the configuration document, creating its directory on first save.
 * The token is written here and read only by this process — it is never
 * returned to the browser by any route.
 */
function saveConfig(update) {
  fs.mkdirSync(CONFIG_DIRECTORY, { recursive: true });
  const merged = { ...readConfigFile(), ...update };
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export { CONFIG_FILE_PATH, DEFAULT_PORT, isJiraConfigured, loadConfig, saveConfig };
