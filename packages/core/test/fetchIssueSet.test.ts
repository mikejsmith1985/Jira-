// fetchIssueSet.test.ts — The one door between a JQL string and any number.
//
// Four failures are distinguished here rather than collapsed into "no results",
// because each asks the reader for something different. A permission gap shown
// as an empty backlog is the specific mistake that mapping exists to prevent —
// and every one of them must produce a set carrying no issues at all, so nothing
// downstream can compute over a query that never ran.

import { describe, expect, it, vi } from "vitest";

import { fetchIssueSet } from "../src/jira/fetchIssueSet.js";
import type { JiraAdapter, JiraResponse, JiraSearchPage } from "../src/jira/jiraAdapter.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";

/** An adapter whose search answers however the test needs it to. */
function buildAdapter(options: {
  searchReply?: Partial<JiraResponse<JiraSearchPage>>;
  issueDetailReply?: Partial<JiraResponse<Record<string, unknown>>>;
}): JiraAdapter {
  return {
    searchIssuesByJql: vi.fn(async () => ({
      statusCode: 200,
      body: { startAt: 0, maxResults: 100, total: 0, issues: [], names: {} },
      jiraMessages: [],
      retryAfterSeconds: null,
      ...options.searchReply,
    })) as JiraAdapter["searchIssuesByJql"],
    fetchIssueDetail: vi.fn(async () => ({
      statusCode: 200,
      body: {},
      jiraMessages: [],
      retryAfterSeconds: null,
      ...options.issueDetailReply,
    })) as JiraAdapter["fetchIssueDetail"],
    fetchFieldCatalogue: vi.fn(),
    fetchTransitions: vi.fn(),
    probeCapabilities: vi.fn(),
  } as unknown as JiraAdapter;
}

/** One raw issue as a search returns it. */
function buildRawIssue(key: string, extra: Record<string, unknown> = {}) {
  return {
    id: key,
    key,
    fields: { summary: `Work on ${key}`, status: { statusCode: 1, statusCategory: { key: "new" } } },
    ...extra,
  };
}

/** The standard input, overridable per test. */
function buildInput(overrides = {}) {
  return {
    jql: "project = ENCUC",
    fieldSelection: { kind: "explicit" as const, fieldIds: ["summary", "status"] },
    doesRequireChangelog: false,
    configuration: buildDefaultWorkspaceConfiguration(),
    ...overrides,
  };
}

describe("a successful retrieval", () => {
  it("freezes the issues with a record of how they were obtained", async () => {
    const adapter = buildAdapter({
      searchReply: {
        body: {
          startAt: 0,
          maxResults: 100,
          total: 2,
          issues: [buildRawIssue("ENCUC-1"), buildRawIssue("ENCUC-2")],
          names: { customfield_10236: "Story Points" },
        },
      },
    });

    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.state).toBe("complete");
    expect(issueSet.issues).toHaveLength(2);
    expect(issueSet.record.jql).toBe("project = ENCUC");
    expect(issueSet.record.fetchedCount).toBe(2);
  });

  it("keeps Jira's own field labels, so a surface can show which field was read", async () => {
    const adapter = buildAdapter({
      searchReply: {
        body: {
          startAt: 0,
          maxResults: 100,
          total: 1,
          issues: [buildRawIssue("ENCUC-1")],
          names: { customfield_10236: "Story Points" },
        },
      },
    });

    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.issues[0]?.fieldNames.get("customfield_10236")).toBe("Story Points");
  });

  it("stamps the configuration fingerprint onto the record", async () => {
    const adapter = buildAdapter({});
    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.record.workspaceFingerprint).toHaveLength(8);
  });

  it("reports an empty result as a successful retrieval, not as a failure", async () => {
    const issueSet = await fetchIssueSet(buildInput(), buildAdapter({}));

    expect(issueSet.state).toBe("complete");
    expect(issueSet.record.failure).toBeNull();
    expect(issueSet.issues).toHaveLength(0);
  });
});

describe("the four failures are told apart", () => {
  it("maps a 400 to a JQL error carrying Jira's own words", async () => {
    const adapter = buildAdapter({
      searchReply: {
        statusCode: 400,
        body: null,
        jiraMessages: ["Field 'cf[99999]' does not exist or you do not have permission to view it."],
      },
    });

    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.state).toBe("failed");
    expect(issueSet.record.failure).toEqual({
      kind: "jql-error",
      jiraMessages: ["Field 'cf[99999]' does not exist or you do not have permission to view it."],
    });
  });

  it("maps a 401 to an authentication failure, so an expired token reads as one", async () => {
    const adapter = buildAdapter({ searchReply: { statusCode: 401, body: null } });

    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.record.failure?.kind).toBe("authentication");
  });

  it("maps a 403 to a permission failure, never to an empty backlog", async () => {
    const adapter = buildAdapter({ searchReply: { statusCode: 403, body: null } });

    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.record.failure?.kind).toBe("permission");
    expect(issueSet.issues).toHaveLength(0);
  });

  it("maps a 429 to a transport failure carrying Retry-After", async () => {
    const adapter = buildAdapter({
      searchReply: { statusCode: 429, body: null, retryAfterSeconds: 45 },
    });

    const issueSet = await fetchIssueSet(buildInput(), adapter);
    const failure = issueSet.record.failure;

    expect(failure?.kind).toBe("transport");
    expect(failure?.kind === "transport" && failure.retryAfterSeconds).toBe(45);
  });

  it("carries no issues whatever the failure was", async () => {
    for (const statusCode of [400, 401, 403, 429, 500]) {
      const adapter = buildAdapter({ searchReply: { statusCode, body: null } });
      const issueSet = await fetchIssueSet(buildInput(), adapter);

      expect(issueSet.issues).toHaveLength(0);
      expect(issueSet.state).toBe("failed");
    }
  });
});

describe("change history", () => {
  it("is not requested when no measure needs it", async () => {
    const adapter = buildAdapter({});
    const issueSet = await fetchIssueSet(buildInput(), adapter);

    expect(issueSet.record.changelogCoverage).toBe("none");
    expect(adapter.fetchIssueDetail).not.toHaveBeenCalled();
  });

  it("is reported as full when the search returned it", async () => {
    const adapter = buildAdapter({
      searchReply: {
        body: {
          startAt: 0,
          maxResults: 100,
          total: 1,
          issues: [buildRawIssue("ENCUC-1", { changelog: { histories: [] } })],
          names: {},
        },
      },
    });

    const issueSet = await fetchIssueSet(buildInput({ doesRequireChangelog: true }), adapter);

    expect(issueSet.record.changelogCoverage).toBe("full");
    expect(adapter.fetchIssueDetail).not.toHaveBeenCalled();
  });

  it("falls back to per-issue fetches when the search omitted it", async () => {
    const adapter = buildAdapter({
      searchReply: {
        body: {
          startAt: 0,
          maxResults: 100,
          total: 1,
          issues: [buildRawIssue("ENCUC-1")],
          names: {},
        },
      },
      issueDetailReply: { body: { changelog: { histories: [] } } },
    });

    const issueSet = await fetchIssueSet(buildInput({ doesRequireChangelog: true }), adapter);

    expect(adapter.fetchIssueDetail).toHaveBeenCalledWith("ENCUC-1", {
      doesIncludeChangelog: true,
    });
    expect(issueSet.record.changelogCoverage).toBe("full");
  });

  it("reports partial coverage rather than pretending the history is complete", async () => {
    const adapter = buildAdapter({
      searchReply: {
        body: {
          startAt: 0,
          maxResults: 100,
          total: 2,
          issues: [buildRawIssue("ENCUC-1"), buildRawIssue("ENCUC-2")],
          names: {},
        },
      },
    });
    // The first per-issue fetch succeeds, the second is refused.
    let callCount = 0;
    adapter.fetchIssueDetail = vi.fn(async () => {
      callCount += 1;
      return callCount === 1
        ? { statusCode: 200, body: { changelog: { histories: [] } }, jiraMessages: [], retryAfterSeconds: null }
        : { statusCode: 403, body: null, jiraMessages: [], retryAfterSeconds: null };
    }) as JiraAdapter["fetchIssueDetail"];

    const issueSet = await fetchIssueSet(buildInput({ doesRequireChangelog: true }), adapter);

    expect(issueSet.record.changelogCoverage).toBe("partial");
  });
});

describe("mapped concepts are always retrieved", () => {
  it("adds a confirmed field id to the request even when the caller did not ask", async () => {
    const configuration = {
      ...buildDefaultWorkspaceConfiguration(),
      fieldMap: {
        ...buildDefaultWorkspaceConfiguration().fieldMap,
        storyPoints: {
          state: "resolved" as const,
          fieldId: "customfield_10236",
          jiraName: "Story Points",
          matchedBy: "exact-name" as const,
          confirmedAtIso: "2026-09-01T00:00:00.000Z",
        },
      },
    };
    const adapter = buildAdapter({});

    const issueSet = await fetchIssueSet(buildInput({ configuration }), adapter);

    expect(issueSet.record.fieldsRequested).toContain("customfield_10236");
  });
});
