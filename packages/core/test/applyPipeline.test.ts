// applyPipeline.test.ts — Nothing reaches Jira that a person did not see first.
//
// Three properties carry the weight. A value that already matches produces no
// write, so nobody approves a change that changes nothing. One blocker refuses
// the WHOLE batch, because a half-applied set is unreviewable. And once applied,
// each item stands alone — one failure neither prevents nor undoes the others,
// and nothing is rolled back to make the batch look tidy.

import { describe, expect, it, vi } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import { buildChangeSet, canApplyChangeSet } from "../src/apply/buildChangeSet.js";
import type { Proposal } from "../src/apply/buildChangeSet.js";
import { runApplyPlan } from "../src/apply/runApplyPlan.js";
import { SET_MISSING_FIX_VERSION } from "../src/apply/fixes/deterministicFixes.js";
import type { JiraTransport } from "../src/jira/jiraAdapter.js";

/** The acceptance-criteria field on this fictional instance. */
const ACCEPTANCE_FIELD = "customfield_10301";

/** One issue, with whichever fields the test needs. */
function buildIssue(key: string, fields: Record<string, unknown> = {}) {
  return normaliseRawIssue(
    {
      id: key,
      key,
      fields: {
        summary: `Work on ${key}`,
        issuetype: { name: "Story" },
        status: { statusCategory: { key: "new" } },
        fixVersions: [],
        ...fields,
      },
    },
    { [ACCEPTANCE_FIELD]: "Acceptance Criteria" },
  );
}

/** An issue set holding the given issues. */
function buildSet(issues: readonly ReturnType<typeof buildIssue>[]) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: issues.length,
    fetchedCount: issues.length,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  return buildIssueSet(record, issues);
}

/** A field map with acceptance criteria confirmed. */
function buildFieldMap() {
  const base = buildDefaultWorkspaceConfiguration().fieldMap;
  return {
    ...base,
    acceptanceCriteria: {
      state: "resolved" as const,
      fieldId: ACCEPTANCE_FIELD,
      jiraName: "Acceptance Criteria",
      matchedBy: "exact-name" as const,
      confirmedAtIso: "2026-09-01T00:00:00.000Z",
    },
  };
}

/** A transport that answers however the test needs. */
function buildTransport(statusByIssue: Readonly<Record<string, number>> = {}): JiraTransport {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(async (pathAndQuery: string) => {
      const issueKey = /\/issue\/([^/?]+)/.exec(pathAndQuery)?.[1] ?? "";
      const statusCode = statusByIssue[decodeURIComponent(issueKey)] ?? 204;
      return {
        statusCode,
        body: null,
        jiraMessages: statusCode >= 400 ? ["Field cannot be set on this screen"] : [],
        retryAfterSeconds: null,
      };
    }),
  } as unknown as JiraTransport;
}

/** A proposal against a mapped concept. */
function buildProposal(issueKey: string, proposedValue: unknown): Proposal {
  return {
    issueKey,
    target: { kind: "concept", conceptId: "acceptanceCriteria" },
    proposedValue,
    writeRoute: "simple",
    source: "pack",
  };
}

describe("only genuine differences become writes", () => {
  it("omits a field whose proposed value already matches", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1", { [ACCEPTANCE_FIELD]: "Given a member…" })]);

    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "Given a member…")],
      issueSet,
      fieldMap: buildFieldMap(),
    });

    expect(changeSet.plannedChanges).toHaveLength(0);
    expect(changeSet.unchangedCount).toBe(1);
  });

  it("ignores a difference that is only whitespace", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1", { [ACCEPTANCE_FIELD]: "Given a member…" })]);

    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "  Given a member…  ")],
      issueSet,
      fieldMap: buildFieldMap(),
    });

    expect(changeSet.plannedChanges).toHaveLength(0);
  });

  it("plans a write for a real change, carrying both values for the diff", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1", { [ACCEPTANCE_FIELD]: "old" })]);

    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "new")],
      issueSet,
      fieldMap: buildFieldMap(),
    });

    expect(changeSet.plannedChanges[0]).toMatchObject({
      issueKey: "ENCUC-1",
      currentValue: "old",
      proposedValue: "new",
      fieldLabel: "Acceptance Criteria",
    });
  });

  it("treats an empty field as a change rather than as a match", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")]);

    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "Given a member…")],
      issueSet,
      fieldMap: buildFieldMap(),
    });

    expect(changeSet.plannedChanges).toHaveLength(1);
  });
});

describe("one blocker refuses the whole batch", () => {
  it("blocks a proposal for a concept with no confirmed field", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")]);
    // The default map has nothing confirmed.
    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "anything")],
      issueSet,
      fieldMap: buildDefaultWorkspaceConfiguration().fieldMap,
    });

    expect(changeSet.blockers).toHaveLength(1);
    expect(canApplyChangeSet(changeSet)).toBe(false);
  });

  it("blocks a proposal for an issue nobody retrieved", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")]);

    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-404", "anything")],
      issueSet,
      fieldMap: buildFieldMap(),
    });

    expect(changeSet.blockers[0]?.reason).toMatch(/was not in the retrieval/i);
  });

  it("writes nothing at all when a blocker is present", async () => {
    const issueSet = buildSet([buildIssue("ENCUC-1"), buildIssue("ENCUC-2")]);
    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "fine"), buildProposal("ENCUC-404", "blocked")],
      issueSet,
      fieldMap: buildFieldMap(),
    });
    const transport = buildTransport();

    const outcome = await runApplyPlan(changeSet, transport);

    expect(outcome.refusedReason).toMatch(/nothing was written/i);
    expect(transport.put).not.toHaveBeenCalled();
  });
});

describe("applied changes stand alone", () => {
  it("applies four when the third of five fails", async () => {
    const issues = ["ENCUC-1", "ENCUC-2", "ENCUC-3", "ENCUC-4", "ENCUC-5"].map((key) =>
      buildIssue(key),
    );
    const issueSet = buildSet(issues);
    const changeSet = buildChangeSet({
      proposals: issues.map((issue) => buildProposal(issue.key, "new value")),
      issueSet,
      fieldMap: buildFieldMap(),
    });

    const outcome = await runApplyPlan(changeSet, buildTransport({ "ENCUC-3": 400 }));

    expect(outcome.appliedCount).toBe(4);
    expect(outcome.failedCount).toBe(1);
  });

  it("carries Jira's own reason on the failure", async () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")]);
    const changeSet = buildChangeSet({
      proposals: [buildProposal("ENCUC-1", "new value")],
      issueSet,
      fieldMap: buildFieldMap(),
    });

    const outcome = await runApplyPlan(changeSet, buildTransport({ "ENCUC-1": 400 }));

    expect(outcome.results[0]?.message).toBe("Field cannot be set on this screen");
  });

  it("does not roll back the successes to make the batch look tidy", async () => {
    const issues = [buildIssue("ENCUC-1"), buildIssue("ENCUC-2")];
    const issueSet = buildSet(issues);
    const changeSet = buildChangeSet({
      proposals: issues.map((issue) => buildProposal(issue.key, "new value")),
      issueSet,
      fieldMap: buildFieldMap(),
    });
    const transport = buildTransport({ "ENCUC-2": 400 });

    await runApplyPlan(changeSet, transport);

    // Two attempts, not three: nothing was written a second time to undo it.
    expect(transport.put).toHaveBeenCalledTimes(2);
  });
});

describe("Jira's field shapes", () => {
  it("writes a fix version through update.set, never through fields", async () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")]);
    const changeSet = buildChangeSet({
      proposals: SET_MISSING_FIX_VERSION.buildProposals({
        issueSet,
        flaggedIssues: issueSet.issues,
        parameters: { versionName: "2026.09" },
      }),
      issueSet,
      fieldMap: buildFieldMap(),
    });
    const transport = buildTransport();

    await runApplyPlan(changeSet, transport);

    const body = (transport.put as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[1];

    // Through `fields` Jira accepts the request and silently does nothing on
    // many configurations, which is the quiet failure this shape avoids.
    expect(body).toHaveProperty("update.fixVersions");
    expect(body).not.toHaveProperty("fields.fixVersions");
  });
});

describe("deterministic fixes", () => {
  it("produces the same kind of reviewable change set as an assistant proposal", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1"), buildIssue("ENCUC-2")]);

    const proposals = SET_MISSING_FIX_VERSION.buildProposals({
      issueSet,
      flaggedIssues: issueSet.issues,
      parameters: { versionName: "2026.09" },
    });

    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.source).toBe("deterministic-fix");
    expect(proposals[0]?.rationale).toContain("2026.09");
  });

  it("produces nothing until the user supplies the version, rather than guessing one", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")]);

    const proposals = SET_MISSING_FIX_VERSION.buildProposals({
      issueSet,
      flaggedIssues: issueSet.issues,
      parameters: {},
    });

    expect(proposals).toHaveLength(0);
  });

  it("says what it will do before it does it", () => {
    expect(SET_MISSING_FIX_VERSION.describe(12)).toMatch(/12 issues/);
    expect(SET_MISSING_FIX_VERSION.describe(12)).toMatch(/was → will be/);
  });
});
