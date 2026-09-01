// measure.test.ts — The six constructor invariants.
//
// This is the feature. Everything else is retrieval, presentation or writing.
//
// The predecessor's defining defect was that a query naming a field which did
// not exist returned nothing, and nothing rendered as a perfect green score.
// Failure and success looked identical. These tests assert that `measure()`
// cannot produce that outcome — not by convention, but because the constructor
// refuses.

import { describe, expect, it } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import type { RetrievalFailure } from "../src/model/issueSet.js";
import { measure } from "../src/measure/measure.js";

/** An issue set holding the given keys, retrieved cleanly. */
function buildSetWithKeys(keys: readonly string[], totalMatchingCount = keys.length) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 100,
    totalMatchingCount,
    fetchedCount: keys.length,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  const issues = keys.map((key) =>
    normaliseRawIssue({ id: key, key, fields: { status: { statusCategory: { key: "new" } } } }, {}),
  );
  return buildIssueSet(record, issues);
}

/** An issue set whose retrieval failed for the given reason. */
function buildFailedSet(failure: RetrievalFailure) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC AND cf[99999] IS EMPTY",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 40,
    totalMatchingCount: 0,
    fetchedCount: 0,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure,
  });
  return buildIssueSet(record, []);
}

describe("M-1 · a failed retrieval can never produce a result", () => {
  it("returns unresolved even when the caller passes a perfectly good population", () => {
    const result = measure({
      sourceId: "missing-fix-version",
      flaggedKeys: [],
      eligibleKeys: ["ENCUC-1", "ENCUC-2"],
      issueSet: buildFailedSet({ kind: "jql-error", jiraMessages: ["Field 'cf[99999]' does not exist"] }),
    });

    expect(result.state).toBe("unresolved");
  });

  it("carries Jira's own error text through to whatever renders it", () => {
    const result = measure({
      sourceId: "missing-fix-version",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildFailedSet({ kind: "jql-error", jiraMessages: ["Field 'cf[99999]' does not exist"] }),
    });

    expect(result.state === "unresolved" && result.blocker).toEqual({
      kind: "retrieval-failed",
      failure: { kind: "jql-error", jiraMessages: ["Field 'cf[99999]' does not exist"] },
    });
  });

  it("returns unresolved for an expired credential, not an empty pass", () => {
    const result = measure({
      sourceId: "missing-story-points",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildFailedSet({ kind: "authentication" }),
    });

    expect(result.state).toBe("unresolved");
  });
});

describe("M-2 · an empty population is never a pass", () => {
  it("returns not-applicable rather than measured when nothing is eligible", () => {
    const result = measure({
      sourceId: "missing-target-date",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildSetWithKeys(["ENCUC-1", "ENCUC-2"]),
    });

    expect(result.state).toBe("not-applicable");
  });

  it("says in words why there was nothing to check", () => {
    const result = measure({
      sourceId: "missing-target-date",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildSetWithKeys(["ENCUC-1"]),
    });

    expect(result.state === "not-applicable" && result.reason).toMatch(/nothing in scope/i);
  });

  it("reports a genuine all-clear as measured, so a pass is still a pass", () => {
    const result = measure({
      sourceId: "missing-story-points",
      flaggedKeys: [],
      eligibleKeys: ["ENCUC-1", "ENCUC-2"],
      issueSet: buildSetWithKeys(["ENCUC-1", "ENCUC-2"]),
    });

    expect(result.state).toBe("measured");
    expect(result.state === "measured" && result.eligibleKeys).toHaveLength(2);
  });
});

describe("M-3 and M-4 · a count can never exceed or escape its population", () => {
  it("refuses a flagged key that is not in the eligible population", () => {
    expect(() =>
      measure({
        sourceId: "missing-story-points",
        flaggedKeys: ["ENCUC-9"],
        eligibleKeys: ["ENCUC-1"],
        issueSet: buildSetWithKeys(["ENCUC-1", "ENCUC-9"]),
      }),
    ).toThrow(/not in its own population/i);
  });

  it("refuses an eligible key that was never retrieved", () => {
    expect(() =>
      measure({
        sourceId: "missing-story-points",
        flaggedKeys: [],
        eligibleKeys: ["ENCUC-404"],
        issueSet: buildSetWithKeys(["ENCUC-1"]),
      }),
    ).toThrow(/was not retrieved/i);
  });
});

describe("M-5 · a floor is never presented as a total", () => {
  it("marks a measure over a truncated retrieval as partial", () => {
    const result = measure({
      sourceId: "missing-fix-version",
      flaggedKeys: ["ENCUC-1"],
      eligibleKeys: ["ENCUC-1", "ENCUC-2"],
      issueSet: buildSetWithKeys(["ENCUC-1", "ENCUC-2"], 4_317),
    });

    expect(result.state === "measured" && result.isPartial).toBe(true);
  });

  it("does not mark a complete retrieval as partial", () => {
    const result = measure({
      sourceId: "missing-fix-version",
      flaggedKeys: [],
      eligibleKeys: ["ENCUC-1"],
      issueSet: buildSetWithKeys(["ENCUC-1"]),
    });

    expect(result.state === "measured" && result.isPartial).toBe(false);
  });
});

describe("M-6 · every measure carries its own provenance", () => {
  it("stamps the retrieval and the configuration that produced it", () => {
    const issueSet = buildSetWithKeys(["ENCUC-1"]);
    const result = measure({
      sourceId: "missing-story-points",
      flaggedKeys: [],
      eligibleKeys: ["ENCUC-1"],
      issueSet,
    });

    expect(result.provenance.sourceId).toBe("missing-story-points");
    expect(result.provenance.record.jql).toBe(issueSet.record.jql);
    expect(result.provenance.workspaceFingerprint).toBe("a3f91c2e");
  });

  it("stamps provenance on an unresolved measure too, so a failure is traceable", () => {
    const result = measure({
      sourceId: "missing-story-points",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildFailedSet({ kind: "permission", projectKeys: ["QEINT"] }),
    });

    expect(result.provenance.record.jql).toContain("cf[99999]");
  });
});

describe("the count and its drill-through are the same list", () => {
  it("exposes no count field that could disagree with the keys", () => {
    const result = measure({
      sourceId: "missing-acceptance-criteria",
      flaggedKeys: ["ENCUC-1", "ENCUC-2"],
      eligibleKeys: ["ENCUC-1", "ENCUC-2", "ENCUC-3"],
      issueSet: buildSetWithKeys(["ENCUC-1", "ENCUC-2", "ENCUC-3"]),
    });

    expect(result).not.toHaveProperty("count");
    expect(result.state === "measured" && result.flaggedKeys).toEqual(["ENCUC-1", "ENCUC-2"]);
  });
});

describe("an unmapped concept blocks the check before it runs", () => {
  it("returns unresolved naming the concept that could not be resolved", () => {
    const result = measure({
      sourceId: "missing-acceptance-criteria",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildSetWithKeys(["ENCUC-1"]),
      blocker: { kind: "concept-unmapped", conceptIds: ["acceptanceCriteria"] },
    });

    expect(result.state).toBe("unresolved");
    expect(result.state === "unresolved" && result.blocker).toEqual({
      kind: "concept-unmapped",
      conceptIds: ["acceptanceCriteria"],
    });
  });

  it("prefers a retrieval failure over a concept blocker, because nothing ran at all", () => {
    const result = measure({
      sourceId: "missing-acceptance-criteria",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildFailedSet({ kind: "authentication" }),
      blocker: { kind: "concept-unmapped", conceptIds: ["acceptanceCriteria"] },
    });

    expect(result.state === "unresolved" && result.blocker.kind).toBe("retrieval-failed");
  });
});
