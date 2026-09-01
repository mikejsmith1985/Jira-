// dataCenterAdapter.test.ts — What actually leaves this process.
//
// Three assertions here descend directly from research findings, and each one
// guards against a silent narrowing rather than a loud error:
//
//  - `expand` always includes `names`, so a surface can show Jira's own label
//    for whichever field a check read.
//  - `fields` is never omitted, because Jira quietly defaults a search to
//    navigable fields only, hiding custom fields from a response that looks
//    complete.
//  - changelog is requested only when asked for, because Data Center returns
//    uncapped history and Atlassian's own words are that it "may cause OOM
//    easily".

import { describe, expect, it, vi } from "vitest";

import { createDataCenterAdapter } from "../src/jira/dataCenterAdapter.js";
import type { JiraResponse, JiraTransport } from "../src/jira/jiraAdapter.js";

/** Records every path requested, so the test can inspect the URL that was built. */
function buildRecordingTransport(response: Partial<JiraResponse<unknown>> = {}) {
  const requestedPaths: string[] = [];
  const reply = {
    statusCode: 200,
    body: { startAt: 0, maxResults: 50, total: 0, issues: [], names: {} },
    jiraMessages: [],
    retryAfterSeconds: null,
    ...response,
  };
  const transport: JiraTransport = {
    get: vi.fn(async (pathAndQuery: string) => {
      requestedPaths.push(pathAndQuery);
      return reply as JiraResponse<never>;
    }),
    post: vi.fn(async (pathAndQuery: string) => {
      requestedPaths.push(pathAndQuery);
      return reply as JiraResponse<never>;
    }),
    put: vi.fn(async () => reply as JiraResponse<void>),
  };
  return { transport, requestedPaths };
}

/** A minimal search request; individual tests override what they exercise. */
function buildSearchRequest(overrides = {}) {
  return {
    jql: "project = ENCUC",
    fields: { kind: "explicit" as const, fieldIds: ["summary", "status"] },
    doesIncludeChangelog: false,
    startAt: 0,
    maxResults: 100,
    ...overrides,
  };
}

describe("the search request Jira actually receives", () => {
  it("always asks for field names, so a reader can see which field was read", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(buildSearchRequest());

    expect(requestedPaths[0]).toContain("expand=names");
  });

  it("never omits the field list, because Jira silently narrows to navigable fields", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(buildSearchRequest());

    expect(requestedPaths[0]).toContain("fields=summary%2Cstatus");
  });

  it("asks for every field only when explicitly told to", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(
      buildSearchRequest({ fields: { kind: "all" } }),
    );

    expect(requestedPaths[0]).toContain("fields=*all");
  });

  it("omits changelog unless the caller needs history", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(buildSearchRequest());

    expect(requestedPaths[0]).not.toContain("changelog");
  });

  it("requests changelog when a flow measure needs it", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(
      buildSearchRequest({ doesIncludeChangelog: true }),
    );

    expect(requestedPaths[0]).toContain("changelog");
  });

  it("escapes the query so a JQL string cannot break the URL", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(
      buildSearchRequest({ jql: 'project = ENCUC AND summary ~ "a & b"' }),
    );

    // URLSearchParams encodes a query string in form style, so spaces become
    // "+" and reserved characters become percent escapes. Both forms are valid
    // and Jira accepts either; what matters is that nothing in the user's JQL
    // can escape its own parameter and alter the request.
    const requestedPath = requestedPaths[0] ?? "";

    expect(requestedPath).toContain("jql=project+%3D+ENCUC");
    expect(requestedPath).toContain("%26"); // the ampersand is escaped, not a separator
    expect(requestedPath).not.toContain('"a & b"');
  });

  it("uses the Data Center search endpoint, which is current on 9.x through 11.x", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(buildSearchRequest());

    expect(requestedPaths[0]).toContain("/rest/api/2/search");
  });

  it("pages by offset, which is what Data Center supports", async () => {
    const { transport, requestedPaths } = buildRecordingTransport();
    await createDataCenterAdapter(transport).searchIssuesByJql(
      buildSearchRequest({ startAt: 200, maxResults: 100 }),
    );

    expect(requestedPaths[0]).toContain("startAt=200");
    expect(requestedPaths[0]).toContain("maxResults=100");
  });
});

describe("what comes back", () => {
  it("passes Jira's own error text through untouched", async () => {
    const { transport } = buildRecordingTransport({
      statusCode: 400,
      body: null,
      jiraMessages: ["Field 'cf[99999]' does not exist or you do not have permission to view it."],
    });

    const response = await createDataCenterAdapter(transport).searchIssuesByJql(
      buildSearchRequest(),
    );

    expect(response.statusCode).toBe(400);
    expect(response.jiraMessages[0]).toContain("cf[99999]");
  });

  it("surfaces a rate-limit reply with its Retry-After rather than as an empty page", async () => {
    const { transport } = buildRecordingTransport({
      statusCode: 429,
      body: null,
      jiraMessages: [],
      retryAfterSeconds: 30,
    });

    const response = await createDataCenterAdapter(transport).searchIssuesByJql(
      buildSearchRequest(),
    );

    expect(response.statusCode).toBe(429);
    expect(response.retryAfterSeconds).toBe(30);
  });
});

describe("the field catalogue", () => {
  it("keeps clauseNames, which is what a working Jira link is built from", async () => {
    const { transport } = buildRecordingTransport({
      body: [
        {
          id: "customfield_10236",
          name: "Story Points",
          custom: true,
          clauseNames: ["cf[10236]", "Story Points"],
          schema: { type: "number" },
        },
      ],
    });

    const response = await createDataCenterAdapter(transport).fetchFieldCatalogue();

    expect(response.body?.[0]).toMatchObject({
      fieldId: "customfield_10236",
      jiraName: "Story Points",
      schemaType: "number",
      isCustom: true,
    });
    expect(response.body?.[0]?.clauseNames).toContain("cf[10236]");
  });
});

describe("probeCapabilities", () => {
  it("reports the observed page cap rather than the one that was requested", async () => {
    // Data Center clamps silently above its configured maximum, so the probe
    // asks for more than the common default and reports what came back.
    const transport: JiraTransport = {
      get: vi.fn(async (pathAndQuery: string) => {
        if (pathAndQuery.includes("serverInfo")) {
          return { statusCode: 200, body: { version: "9.12.0" }, jiraMessages: [], retryAfterSeconds: null } as JiraResponse<never>;
        }
        if (pathAndQuery.includes("myself")) {
          return { statusCode: 200, body: { name: "jsmith" }, jiraMessages: [], retryAfterSeconds: null } as JiraResponse<never>;
        }
        if (pathAndQuery.includes("/field")) {
          return { statusCode: 200, body: [], jiraMessages: [], retryAfterSeconds: null } as JiraResponse<never>;
        }
        return {
          statusCode: 200,
          body: { startAt: 0, maxResults: 100, total: 500, issues: [{ changelog: { histories: [] } }], names: {} },
          jiraMessages: [],
          retryAfterSeconds: null,
        } as JiraResponse<never>;
      }),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as JiraTransport;

    const probe = await createDataCenterAdapter(transport).probeCapabilities();

    expect(probe.jiraVersion).toBe("9.12.0");
    expect(probe.observedMaxResultsCap).toBe(100);
    expect(probe.doesSearchReturnChangelog).toBe(true);
    expect(probe.canReadFieldCatalogue).toBe(true);
  });

  it("names what it could not establish instead of assuming it", async () => {
    const transport: JiraTransport = {
      get: vi.fn(async () => ({
        statusCode: 403,
        body: null,
        jiraMessages: ["You do not have permission"],
        retryAfterSeconds: null,
      })),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as JiraTransport;

    const probe = await createDataCenterAdapter(transport).probeCapabilities();

    expect(probe.canReadFieldCatalogue).toBe(false);
    expect(probe.unresolved.length).toBeGreaterThan(0);
  });
});
