// notConfiguredFailure.test.ts — Jira+ must never blame Jira for its own state.
//
// The first person to use this hit it within a minute. Their token was fine —
// the connection test came back "Signed in as ..." — but they had not pressed
// Save, so the proxy refused every request with a 503, and the screen told them
// "Jira answered with status 503."
//
// Jira never answered. Jira+ refused, because it had no address to forward to.
// That is the product's own thesis inverted: a local state presented as a remote
// one, sending somebody to hunt a Jira outage that did not exist.
//
// So an unconfigured refusal is its own failure kind. It is distinguishable from
// a genuine 503 — Jira really can be unavailable, and the two want completely
// different responses from the reader — by a marker the proxy sets and Jira
// itself cannot.

import { describe, expect, it, vi } from "vitest";

import { fetchIssueSet } from "../src/jira/fetchIssueSet.js";
import type { JiraAdapter, JiraResponse, JiraSearchPage } from "../src/jira/jiraAdapter.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";

/** Jira's own "service unavailable", carrying no Jira+ marker. */
const JIRA_IS_DOWN: Partial<JiraResponse<JiraSearchPage>> = {
  statusCode: 503,
  body: null,
  jiraMessages: [],
};

/** Jira+ refusing to forward, because setup is unfinished. */
const NOT_CONFIGURED: Partial<JiraResponse<JiraSearchPage>> = {
  statusCode: 503,
  body: null,
  jiraMessages: ["Set the Jira base URL and personal access token before making requests."],
  jiraPlusFailureKind: "not-configured",
};

/** An adapter whose search answers however the test needs it to. */
function buildAdapter(searchReply: Partial<JiraResponse<JiraSearchPage>>): JiraAdapter {
  return {
    searchIssuesByJql: vi.fn(async () => ({
      statusCode: 200,
      body: { startAt: 0, maxResults: 100, total: 0, issues: [], names: {} },
      jiraMessages: [],
      retryAfterSeconds: null,
      jiraPlusFailureKind: null,
      ...searchReply,
    })) as JiraAdapter["searchIssuesByJql"],
    fetchIssueDetail: vi.fn(),
    fetchFieldCatalogue: vi.fn(),
    fetchTransitions: vi.fn(),
    probeCapabilities: vi.fn(),
  } as unknown as JiraAdapter;
}

/** The standard input. */
function buildInput() {
  return {
    jql: "project = ENCUC",
    fieldSelection: { kind: "explicit" as const, fieldIds: ["summary"] },
    ceiling: 2_000,
    doesRequireChangelog: false,
    configuration: buildDefaultWorkspaceConfiguration(),
  };
}

describe("an unconfigured installation", () => {
  it("reports that Jira+ has no address, not that Jira failed", async () => {
    const set = await fetchIssueSet(buildInput(), buildAdapter(NOT_CONFIGURED));

    expect(set.record.failure?.kind).toBe("not-configured");
  });

  it("never claims Jira answered, because Jira was never asked", async () => {
    const set = await fetchIssueSet(buildInput(), buildAdapter(NOT_CONFIGURED));

    expect(JSON.stringify(set.record.failure)).not.toMatch(/jira answered/i);
  });

  it("still yields a set carrying no issues, so nothing can compute over it", async () => {
    const set = await fetchIssueSet(buildInput(), buildAdapter(NOT_CONFIGURED));

    expect(set.issues).toHaveLength(0);
    expect(set.record.fetchedCount).toBe(0);
  });
});

describe("a genuine Jira outage", () => {
  it("stays a transport failure, because Jira really is the thing that broke", async () => {
    // The distinction is the whole point: telling somebody to finish setup when
    // Jira is actually down wastes their afternoon just as surely as the reverse.
    const set = await fetchIssueSet(buildInput(), buildAdapter(JIRA_IS_DOWN));

    expect(set.record.failure?.kind).toBe("transport");
  });

  it("is not mistaken for unconfigured merely because it shares the status code", async () => {
    const set = await fetchIssueSet(buildInput(), buildAdapter(JIRA_IS_DOWN));

    expect(set.record.failure?.kind).not.toBe("not-configured");
  });
});
