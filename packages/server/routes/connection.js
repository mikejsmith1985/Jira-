// connection.js — Where a person tells Jira+ which Jira, and proves it works.
//
// This route exists because the first release shipped without it: the loader
// could read a stored address and token and could write one, but nothing called
// the writer. An application that starts, serves its interface, and cannot be
// pointed at a Jira is indistinguishable from a broken one.
//
// One asymmetry runs through the whole file. The base URL is readable — a
// screen has to show which Jira it is talking to, and somebody comparing two
// installations needs to see it. The token is readable by nothing, including
// the browser that just set it; only whether one is present. Handing a
// credential back would put it into every screenshot, cache and log that ever
// touches this route, for no gain, since nobody needs to read a token they
// already typed.
//
// Saving updates the live configuration object in place as well as the file, so
// a credential works on the NEXT REQUEST rather than the next launch. A person
// who has to restart after setup reads that as the save having failed.

import express from 'express';

import { isJiraConfigured, loadConfig, saveConfig } from '../config/loader.js';

/** Lowest and highest port a machine will actually listen on. */
const LOWEST_USABLE_PORT = 1024;
const HIGHEST_USABLE_PORT = 65535;

/** Milliseconds to wait for Jira before calling the test inconclusive. */
const CONNECTION_TEST_TIMEOUT_MS = 15000;

/** Addresses that mean the field is still the example, not a real instance. */
const PLACEHOLDER_URL_FRAGMENTS = ['example.com', 'your-instance', 'your-jira'];

/**
 * Checks a proposed address, returning the reason it is unusable or null.
 *
 * A placeholder is rejected rather than stored because an address that LOOKS
 * filled in is worse than an empty one: the first screen stops saying anything
 * is missing, and the failure moves to the first query, where it reads as Jira
 * being broken rather than as setup being unfinished.
 */
function findAddressProblem(baseUrl) {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return 'Enter your Jira address, for example https://jira.yourcompany.com';
  }
  if (!/^https?:\/\/.+/i.test(baseUrl.trim())) {
    return 'The address has to start with http:// or https://';
  }
  if (PLACEHOLDER_URL_FRAGMENTS.some((fragment) => baseUrl.toLowerCase().includes(fragment))) {
    return 'That is the example address. Enter your own Jira address.';
  }
  return null;
}

/** Checks a proposed port, returning the reason it is unusable or null. */
function findPortProblem(port) {
  if (port === undefined || port === null || port === '') return null;
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber)) return 'The port has to be a whole number.';
  if (portNumber < LOWEST_USABLE_PORT || portNumber > HIGHEST_USABLE_PORT) {
    return `The port has to be between ${LOWEST_USABLE_PORT} and ${HIGHEST_USABLE_PORT}.`;
  }
  return null;
}

/** Strips a trailing slash, so a pasted address cannot produce a double slash. */
function normaliseBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** What a screen is allowed to know about the connection. */
function describeConnection(config) {
  return {
    baseUrl: config.baseUrl,
    isTokenPresent: config.personalAccessToken.length > 0,
    isSslVerified: config.isSslVerified,
    isJiraConfigured: isJiraConfigured(config),
    port: config.port,
  };
}

/**
 * Asks Jira who the token belongs to.
 *
 * `/rest/api/2/myself` is the cheapest request that proves all three things at
 * once: the address resolves, TLS is acceptable, and the token authenticates.
 * Reporting the display name back is what makes the result convincing — "it
 * worked" is a claim, "you are signed in as Mike Smith" is evidence.
 */
async function testConnection(candidate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${candidate.baseUrl}/rest/api/2/myself`, {
      headers: { Authorization: `Bearer ${candidate.personalAccessToken}`, Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { isReachable: true, isAuthenticated: false, detail: 'Jira rejected the token.' };
    }
    if (!response.ok) {
      return {
        isReachable: true,
        isAuthenticated: false,
        detail: `Jira answered ${response.status}. Check the address points at Jira itself.`,
      };
    }

    const account = await response.json();
    return {
      isReachable: true,
      isAuthenticated: true,
      detail: `Signed in as ${account.displayName || account.name || 'an unnamed account'}.`,
    };
  } catch (error) {
    // The message is passed through verbatim: a corporate proxy's own wording
    // ("unable to verify the first certificate") tells the user which switch to
    // reach for, and anything paraphrased loses that.
    return { isReachable: false, isAuthenticated: false, detail: describeFailure(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Turns a fetch failure into a sentence naming the likely cause. */
function describeFailure(error) {
  if (error.name === 'AbortError') {
    return `Jira did not answer within ${CONNECTION_TEST_TIMEOUT_MS / 1000} seconds.`;
  }
  const cause = error.cause?.code ?? '';
  if (cause.includes('CERT') || cause.includes('SELF_SIGNED')) {
    return `${error.cause.code} — your network re-signs TLS. Turn off certificate checking below.`;
  }
  if (cause === 'ENOTFOUND' || cause === 'EAI_AGAIN') {
    return 'That address could not be found. Check it for a typo.';
  }
  return error.cause?.message ?? error.message;
}

/**
 * Creates the connection router.
 *
 * @param {object} config The live configuration, updated in place on save.
 */
function createConnectionRouter(config) {
  const router = express.Router();

  router.get('/api/connection', (req, res) => {
    res.json(describeConnection(config));
  });

  router.put('/api/connection', (req, res) => {
    const { baseUrl, personalAccessToken, isSslVerified, port } = req.body ?? {};

    const problem = findAddressProblem(baseUrl) ?? findPortProblem(port);
    if (problem !== null) {
      res.status(400).json({ reason: problem });
      return;
    }

    // An omitted token means "unchanged", never "clear it" — the screen cannot
    // show the stored token, so it cannot send it back, and treating a blank
    // field as a deletion would wipe the credential every time somebody
    // corrected a typo in the address.
    const nextToken =
      typeof personalAccessToken === 'string' && personalAccessToken.length > 0
        ? personalAccessToken
        : config.personalAccessToken;

    const update = {
      baseUrl: normaliseBaseUrl(baseUrl),
      personalAccessToken: nextToken,
      sslVerify: isSslVerified === false ? 'false' : 'true',
    };
    if (port !== undefined && port !== null && port !== '') update.port = Number(port);

    saveConfig(update);

    // Mutated in place rather than replaced: every router already holds this
    // object, so a new one would leave them all pointing at the old credential.
    Object.assign(config, loadConfig());

    res.json(describeConnection(config));
  });

  router.post('/api/connection/test', async (req, res) => {
    const { baseUrl, personalAccessToken } = req.body ?? {};

    // Testing what is on screen rather than what is stored is deliberate: the
    // point is to try a credential BEFORE committing it, so a bad one never
    // becomes the saved state.
    const candidate = {
      baseUrl: typeof baseUrl === 'string' && baseUrl.length > 0
        ? normaliseBaseUrl(baseUrl)
        : config.baseUrl,
      personalAccessToken:
        typeof personalAccessToken === 'string' && personalAccessToken.length > 0
          ? personalAccessToken
          : config.personalAccessToken,
    };

    const problem = findAddressProblem(candidate.baseUrl);
    if (problem !== null) {
      res.status(400).json({ reason: problem });
      return;
    }
    if (candidate.personalAccessToken.length === 0) {
      res.status(400).json({ reason: 'Enter a personal access token first.' });
      return;
    }

    res.json(await testConnection(candidate));
  });

  return router;
}

export { CONNECTION_TEST_TIMEOUT_MS, createConnectionRouter, findAddressProblem, findPortProblem };
