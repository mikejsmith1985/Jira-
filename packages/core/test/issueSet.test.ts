// retrievalRecord.test.ts — The account of how an Issue Set came to exist.
//
// Two properties are asserted because getting either wrong reproduces a defect
// the predecessor shipped: truncation must be DERIVED from Jira's own total
// rather than assigned by a caller who might forget, and a failed retrieval
// must carry no issues at all — so nothing downstream can compute over the
// wreckage of a query that never ran.

import { describe, expect, it } from "vitest";

import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { normaliseRawIssue } from "../src/model/detailedIssue.js";

/** Minimal retrieval inputs; individual tests override only what they exercise. */
function buildRecordInput(overrides: Partial<Parameters<typeof buildRetrievalRecord>[0]> = {}) {
  return {
    jql: "project = ENCUC",
    fieldsRequested: ["summary", "status"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 1_200,
    totalMatchingCount: 312,
    fetchedCount: 312,
    ceiling: 2_000,
    changelogCoverage: "none" as const,
    workspaceFingerprint: "a3f91c2e",
    failure: null,
    ...overrides,
  };
}

/** One retrieved issue, enough to populate a set. */
function buildIssue(key: string) {
  return normaliseRawIssue(
    { id: "1", key, fields: { status: { statusCategory: { key: "new" } } } },
    {},
  );
}

describe("buildRetrievalRecord", () => {
  it("keeps the query exactly as it was sent, so the user can run it in Jira", () => {
    const jql = 'project = ENCUC AND status != "Done" ORDER BY created DESC';

    expect(buildRetrievalRecord(buildRecordInput({ jql })).jql).toBe(jql);
  });

  it("derives truncation from Jira's total rather than from the caller", () => {
    const record = buildRetrievalRecord(
      buildRecordInput({ totalMatchingCount: 4_317, fetchedCount: 2_000 }),
    );

    expect(record.isTruncated).toBe(true);
  });

  it("does not report truncation when the ceiling was reached at exactly the true total", () => {
    const record = buildRetrievalRecord(
      buildRecordInput({ totalMatchingCount: 2_000, fetchedCount: 2_000, ceiling: 2_000 }),
    );

    expect(record.isTruncated).toBe(false);
  });

  it("refuses a fetched count larger than the total Jira reported", () => {
    expect(() =>
      buildRetrievalRecord(buildRecordInput({ totalMatchingCount: 10, fetchedCount: 11 })),
    ).toThrow(/more issues than Jira reported/i);
  });

  it("gives every retrieval a distinct identifier so derived numbers can be traced", () => {
    const first = buildRetrievalRecord(buildRecordInput());
    const second = buildRetrievalRecord(buildRecordInput());

    expect(first.issueSetId).not.toBe(second.issueSetId);
  });
});

describe("buildIssueSet", () => {
  it("reports a complete retrieval when everything Jira matched was fetched", () => {
    const set = buildIssueSet(buildRetrievalRecord(buildRecordInput()), [buildIssue("ENCUC-1")]);

    expect(set.state).toBe("complete");
  });

  it("reports a truncated retrieval as truncated, never as complete", () => {
    const record = buildRetrievalRecord(
      buildRecordInput({ totalMatchingCount: 4_317, fetchedCount: 1 }),
    );

    expect(buildIssueSet(record, [buildIssue("ENCUC-1")]).state).toBe("truncated");
  });

  it("carries no issues when the retrieval failed", () => {
    const record = buildRetrievalRecord(
      buildRecordInput({
        totalMatchingCount: 0,
        fetchedCount: 0,
        failure: { kind: "jql-error", jiraMessages: ["Field 'cf[99999]' does not exist"] },
      }),
    );
    const set = buildIssueSet(record, []);

    expect(set.state).toBe("failed");
    expect(set.issues).toHaveLength(0);
  });

  it("refuses to build a failed set that somehow carries issues", () => {
    const record = buildRetrievalRecord(
      buildRecordInput({
        totalMatchingCount: 0,
        fetchedCount: 0,
        failure: { kind: "authentication" },
      }),
    );

    expect(() => buildIssueSet(record, [buildIssue("ENCUC-1")])).toThrow(/failed retrieval/i);
  });

  it("indexes issues by key so every lens can resolve one without scanning", () => {
    const record = buildRetrievalRecord(buildRecordInput({ totalMatchingCount: 2, fetchedCount: 2 }));
    const set = buildIssueSet(record, [buildIssue("ENCUC-1"), buildIssue("ENCUC-2")]);

    expect(set.byKey.size).toBe(2);
    expect(set.byKey.get("ENCUC-2")?.key).toBe("ENCUC-2");
  });

  it("refuses duplicate keys rather than silently keeping one of them", () => {
    const record = buildRetrievalRecord(buildRecordInput({ totalMatchingCount: 2, fetchedCount: 2 }));

    expect(() => buildIssueSet(record, [buildIssue("ENCUC-1"), buildIssue("ENCUC-1")])).toThrow(
      /duplicate issue key/i,
    );
  });

  it("preserves Jira's own error text so the user reads Jira's words, not ours", () => {
    const jiraMessage = "Field 'cf[99999]' does not exist or you do not have permission to view it.";
    const record = buildRetrievalRecord(
      buildRecordInput({
        totalMatchingCount: 0,
        fetchedCount: 0,
        failure: { kind: "jql-error", jiraMessages: [jiraMessage] },
      }),
    );

    expect(buildIssueSet(record, []).record.failure).toEqual({
      kind: "jql-error",
      jiraMessages: [jiraMessage],
    });
  });
});
