// record.js — Captures fixtures from the real Jira, for the integration layer.
//
// Article V requires integration tests to run against the real thing. For a
// third-party system this project does not own, "the real thing" means fixtures
// recorded from the actual instance — not a generic vendor container, which
// would reproduce Atlassian's defaults rather than this deployment's field
// identifiers, status names, page-size clamp and permissions, and would
// therefore pass while the software stayed wrong about the only Jira that
// matters.
//
// Every capture is stamped with its date and its source instance, because a
// fixture whose provenance is unknown is a fixture nobody can judge. Re-run this
// whenever the instance changes shape.
//
// Usage:  node packages/server/test/fixtures/record.js
// Reads JIRA_BASE_URL and JIRA_PAT from the environment, or the saved config.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../../config/loader.js";

/** Where the recordings are written. */
const FIXTURE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

/** How many issues a sample retrieval asks for. Enough to exercise paging. */
const SAMPLE_PAGE_SIZE = 5;

/** What to capture, and what each recording is for. */
const RECORDINGS = [
  {
    name: "serverInfo",
    path: "/rest/api/2/serverInfo",
    purpose: "Jira version, so a test can state which deployment it describes.",
  },
  {
    name: "fieldCatalogue",
    path: "/rest/api/2/field",
    purpose: "Real field ids, names and JQL clause names on this instance.",
  },
  {
    name: "searchWithChangelog",
    path:
      `/rest/api/2/search?jql=${encodeURIComponent("order by created DESC")}` +
      `&fields=summary%2Cstatus%2Cissuetype&expand=names%2Cchangelog&maxResults=${SAMPLE_PAGE_SIZE}`,
    purpose: "Whether a search returns change history here, and what a page looks like.",
  },
  {
    name: "searchBadField",
    path: `/rest/api/2/search?jql=${encodeURIComponent("cf[99999] IS EMPTY")}&fields=summary`,
    purpose: "Jira's own wording when a query names a field that does not exist.",
  },
];

/** Removes anything that identifies a person, so a fixture can be committed. */
function redactPeople(value) {
  if (Array.isArray(value)) return value.map(redactPeople);
  if (value === null || typeof value !== "object") return value;

  const redacted = {};
  for (const [key, entry] of Object.entries(value)) {
    const isPersonalField = ["emailAddress", "avatarUrls", "displayName"].includes(key);
    redacted[key] = isPersonalField ? "[redacted]" : redactPeople(entry);
  }
  return redacted;
}

/** Fetches one path from Jira with the credential attached. */
async function capture(config, recording) {
  const response = await fetch(`${config.baseUrl}${recording.path}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.personalAccessToken}`,
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body is still worth recording as a status.
  }

  return {
    recordedAtIso: new Date().toISOString(),
    // The instance is named without its credential, so a reader knows which
    // deployment a fixture describes and can judge whether it still applies.
    sourceInstance: config.baseUrl,
    purpose: recording.purpose,
    request: { path: recording.path },
    response: { statusCode: response.status, body: redactPeople(body) },
  };
}

/** Records every fixture. */
async function main() {
  const config = loadConfig();

  if (config.baseUrl.length === 0 || config.personalAccessToken.length === 0) {
    console.error(
      "No Jira credential is configured. Set JIRA_BASE_URL and JIRA_PAT, or run the app once " +
        "and add them in setup.",
    );
    process.exit(1);
  }

  for (const recording of RECORDINGS) {
    const captured = await capture(config, recording);
    const filePath = path.join(FIXTURE_DIRECTORY, `${recording.name}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(captured, null, 2)}\n`, "utf8");
    console.log(`recorded ${recording.name} (status ${captured.response.statusCode})`);
  }

  console.log(`\n${RECORDINGS.length} fixtures written to ${FIXTURE_DIRECTORY}`);
  console.log("Each is stamped with its date and source instance. Commit them.");
}

await main();
