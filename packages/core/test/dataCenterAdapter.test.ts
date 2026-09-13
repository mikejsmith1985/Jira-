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

    // Every space is %20 rather than "+", so the URL reads back unambiguously,
    // and nothing in the user's JQL can escape its own parameter.
    const requestedPath = requestedPaths[0] ?? "";

    expect(requestedPath).toContain("jql=project%20%3D%20ENCUC");
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

/** Answers each path with the body the case is about. */
function buildTransport(bodies: Record<string, unknown>): JiraTransport {
  const answer = async (pathAndQuery: string) => {
    const match = Object.keys(bodies).find((candidate) => pathAndQuery.startsWith(candidate));
    return {
      statusCode: match === undefined ? 404 : 200,
      body: match === undefined ? null : bodies[match],
      jiraMessages: [],
      retryAfterSeconds: null,
    } as JiraResponse<never>;
  };
  return { get: vi.fn(answer), post: vi.fn(answer), put: vi.fn(answer) } as JiraTransport;
}

describe("what there is to search", () => {
  // A basic search is only as good as the lists it offers. Asking somebody to
  // type a project key or a status name exactly is the same barrier as JQL,
  // just with fewer words - so the choices come from the instance itself.
  it("lists the projects the operator can see, by key and by name", () => {
    const transport = buildTransport({
      "/rest/api/2/project": [
        { key: "ENCUC", name: "Enrollment Customer" },
        { key: "DENP", name: "Enrollment Program" },
      ],
    });

    return createDataCenterAdapter(transport)
      .fetchProjects()
      .then((response) => {
        expect(response.body).toEqual([
          { projectKey: "ENCUC", name: "Enrollment Customer" },
          { projectKey: "DENP", name: "Enrollment Program" },
        ]);
      });
  });

  it("lists the statuses with the category each belongs to", () => {
    // The category is what lets "still open" work without knowing one status
    // name on this instance.
    const transport = buildTransport({
      "/rest/api/2/status": [
        { name: "Working", statusCategory: { key: "indeterminate" } },
        { name: "Closed", statusCategory: { key: "done" } },
      ],
    });

    return createDataCenterAdapter(transport)
      .fetchStatuses()
      .then((response) => {
        expect(response.body).toEqual([
          { name: "Working", statusCategoryKey: "indeterminate" },
          { name: "Closed", statusCategoryKey: "done" },
        ]);
      });
  });

  it("lists every issue type in the instance, for a search across projects", () => {
    const transport = buildTransport({
      "/rest/api/2/issuetype": [
        { id: "1", name: "Defect", subtask: false },
        { id: "5", name: "Sub-task", subtask: true },
      ],
    });

    return createDataCenterAdapter(transport)
      .fetchAllIssueTypes()
      .then((response) => {
        expect(response.body?.map((type) => type.name)).toEqual(["Defect", "Sub-task"]);
      });
  });

  it("keeps a failed lookup distinguishable from an empty one", () => {
    // An empty list of projects and an unreachable Jira must never render
    // alike: one means you can see nothing, the other means we do not know.
    const transport = buildTransport({});

    return createDataCenterAdapter(transport)
      .fetchProjects()
      .then((response) => {
        expect(response.body).toBeNull();
      });
  });

  it("names each project only once, however Jira spelled it", () => {
    const transport = buildTransport({ "/rest/api/2/project": [{ key: "ENCUC" }] });

    return createDataCenterAdapter(transport)
      .fetchProjects()
      .then((response) => {
        // A project with no name renders as its key rather than as a blank row.
        expect(response.body).toEqual([{ projectKey: "ENCUC", name: "ENCUC" }]);
      });
  });
});
