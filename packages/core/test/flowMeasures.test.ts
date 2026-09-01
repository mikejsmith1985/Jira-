// flowMeasures.test.ts — The numbers that go in front of a director.
//
// Three properties matter more than the rest, and each descends from a specific
// way the predecessor's figures were wrong: an issue held by several people must
// count once; an issue whose history was never fetched must be excluded and
// counted rather than treated as unfinished; and the two lenses must never be
// able to tell contradictory stories.

import { describe, expect, it } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import { resolveLens, buildVerifyingJql, findLensContradictions } from "../src/flow/completionLens.js";
import {
  buildFlowFacts,
  computeAgingWork,
  computeCycleTime,
  computeHolderTotals,
  computeThroughput,
} from "../src/flow/flowMeasures.js";
import { allocateHolderCredit, assertSharesSumToOne } from "../src/flow/attribution.js";
import { buildIssueTimeline } from "../src/flow/issueTimeline.js";

/** A status change at a moment. */
function statusChange(atIso: string, fromStatus: string, toStatus: string) {
  return {
    created: atIso,
    author: { accountId: "acc-1" },
    items: [{ field: "status", fromString: fromStatus, toString: toStatus }],
  };
}

/** An assignee change at a moment. */
function assigneeChange(atIso: string, fromHolder: string | null, toHolder: string | null) {
  return {
    created: atIso,
    author: { accountId: "acc-1" },
    items: [{ field: "assignee", fromString: fromHolder, toString: toHolder }],
  };
}

/** One issue with a history. Passing `histories: null` means history was never fetched. */
function buildIssue(
  key: string,
  options: {
    createdIso?: string;
    statusName?: string;
    issueTypeName?: string;
    histories?: readonly Record<string, unknown>[] | null;
  } = {},
) {
  const raw: Record<string, unknown> = {
    id: key,
    key,
    fields: {
      summary: `Work on ${key}`,
      issuetype: { name: options.issueTypeName ?? "Story" },
      status: { name: options.statusName ?? "Done", statusCategory: { key: "done" } },
      created: options.createdIso ?? "2026-06-01T09:00:00.000Z",
      assignee: { accountId: "acc-1" },
    },
  };
  if (options.histories !== null) {
    raw.changelog = { histories: options.histories ?? [] };
  }
  return normaliseRawIssue(raw, {});
}

/** An issue set holding the given issues. */
function buildSet(issues: readonly ReturnType<typeof buildIssue>[]) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names", "changelog"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: issues.length,
    fetchedCount: issues.length,
    ceiling: 2_000,
    changelogCoverage: "full",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  return buildIssueSet(record, issues);
}

/** A configuration whose integration lens names a real status. */
function buildConfiguration() {
  const base = buildDefaultWorkspaceConfiguration();
  return {
    ...base,
    completionLenses: {
      ...base.completionLenses,
      "delivered-to-int": {
        ...base.completionLenses["delivered-to-int"],
        completedWhen: { kind: "named-statuses" as const, statusNames: ["Ready for Integration Test"] },
        startedWhen: { kind: "named-statuses" as const, statusNames: ["In Progress"] },
      },
    },
  };
}

describe("no sprint is involved in any of it", () => {
  it("computes throughput from history alone", () => {
    const issues = [
      buildIssue("ENCUC-1", {
        histories: [
          statusChange("2026-06-02T09:00:00.000Z", "To Do", "In Progress"),
          statusChange("2026-06-08T09:00:00.000Z", "In Progress", "Ready for Integration Test"),
        ],
      }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const throughput = computeThroughput(facts, issueSet);

    expect(throughput.completed.state).toBe("measured");
    expect(throughput.weeks).toHaveLength(1);
    expect(throughput.weeks[0]?.completedKeys).toEqual(["ENCUC-1"]);
  });
});

describe("an issue held by several people counts once", () => {
  it("adds one to the team total, not one per holder", () => {
    const issues = [
      buildIssue("ENCUC-1", {
        histories: [
          statusChange("2026-06-02T09:00:00.000Z", "To Do", "In Progress"),
          assigneeChange("2026-06-03T09:00:00.000Z", "alice", "bob"),
          assigneeChange("2026-06-04T09:00:00.000Z", "bob", "carol"),
          assigneeChange("2026-06-05T09:00:00.000Z", "carol", "dave"),
          statusChange("2026-06-08T09:00:00.000Z", "In Progress", "Ready for Integration Test"),
        ],
      }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const throughput = computeThroughput(facts, issueSet);

    expect(throughput.completed.state === "measured" && throughput.completed.flaggedKeys).toEqual([
      "ENCUC-1",
    ]);
  });

  it("divides the issue among holders so the shares sum to exactly one", () => {
    const issue = buildIssue("ENCUC-1", {
      histories: [
        assigneeChange("2026-06-02T09:00:00.000Z", "alice", "bob"),
        assigneeChange("2026-06-04T09:00:00.000Z", "bob", "carol"),
      ],
    });
    const configuration = buildConfiguration();
    const credits = allocateHolderCredit(
      buildIssueTimeline(issue),
      { fromMs: Date.parse("2026-06-01T00:00:00.000Z"), toMs: Date.parse("2026-06-08T00:00:00.000Z") },
      configuration.workingCalendar,
    );

    expect(credits.length).toBeGreaterThan(1);
    expect(() => assertSharesSumToOne(credits)).not.toThrow();
    expect(credits.reduce((sum, credit) => sum + credit.shareOfIssue, 0)).toBeCloseTo(1, 9);
  });

  it("makes per-person credit sum to the number of issues", () => {
    const issues = [
      buildIssue("ENCUC-1", { histories: [assigneeChange("2026-06-03T09:00:00.000Z", "alice", "bob")] }),
      buildIssue("ENCUC-2", { histories: [assigneeChange("2026-06-03T09:00:00.000Z", "bob", "carol")] }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const totals = computeHolderTotals(facts, {
      fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
      toMs: Date.parse("2026-06-08T00:00:00.000Z"),
    });
    const summed = totals.reduce((sum, total) => sum + total.creditedIssues, 0);

    expect(summed).toBeCloseTo(2, 9);
  });

  it("offers a touched count separately, and it is deliberately not additive", () => {
    const issues = [
      buildIssue("ENCUC-1", { histories: [assigneeChange("2026-06-03T09:00:00.000Z", "alice", "bob")] }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const totals = computeHolderTotals(facts, {
      fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
      toMs: Date.parse("2026-06-08T00:00:00.000Z"),
    });
    const touchedSum = totals.reduce((sum, total) => sum + total.touchedIssueCount, 0);

    // Two people touched one issue, so the touched counts sum to two while the
    // credited shares sum to one. Both are correct; only one of them adds up.
    expect(touchedSum).toBe(2);
  });
});

describe("history that was never fetched", () => {
  it("excludes the issue and names it, rather than treating it as unfinished", () => {
    const issues = [
      buildIssue("ENCUC-1", { histories: [statusChange("2026-06-08T09:00:00.000Z", "In Progress", "Ready for Integration Test")] }),
      buildIssue("ENCUC-2", { histories: null }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);

    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    expect(facts.excludedKeys).toEqual(["ENCUC-2"]);
    expect(facts.facts).toHaveLength(1);
  });

  it("reports every measure as unresolved when no issue has history at all", () => {
    const issues = [buildIssue("ENCUC-1", { histories: null })];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const throughput = computeThroughput(facts, issueSet);

    expect(throughput.completed.state).toBe("unresolved");
    expect(
      throughput.completed.state === "unresolved" && throughput.completed.blocker.kind,
    ).toBe("history-unavailable");
  });
});

describe("an undefined lens", () => {
  it("reports as unresolved rather than counting nothing", () => {
    const issues = [buildIssue("ENCUC-1", { histories: [] })];
    const issueSet = buildSet(issues);
    // The default integration lens names no status yet.
    const configuration = buildDefaultWorkspaceConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const throughput = computeThroughput(facts, issueSet);

    expect(throughput.completed.state).toBe("unresolved");
    expect(throughput.completed.state === "unresolved" && throughput.completed.blocker.kind).toBe(
      "lens-undefined",
    );
  });
});

describe("completion conventions", () => {
  it("counts the LAST qualifying entry, so a regression cannot inflate a week", () => {
    const issues = [
      buildIssue("ENCUC-1", {
        histories: [
          statusChange("2026-06-02T09:00:00.000Z", "To Do", "In Progress"),
          statusChange("2026-06-05T09:00:00.000Z", "In Progress", "Ready for Integration Test"),
          statusChange("2026-06-09T09:00:00.000Z", "Ready for Integration Test", "In Progress"),
          statusChange("2026-06-16T09:00:00.000Z", "In Progress", "Ready for Integration Test"),
        ],
      }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const throughput = computeThroughput(facts, issueSet);

    // One completion, in the later week, not two.
    expect(throughput.weeks).toHaveLength(1);
    expect(throughput.weeks[0]?.isoWeek).toBe("2026-W25");
  });

  it("reports a completed item with no start rather than recording zero days", () => {
    const issues = [
      buildIssue("ENCUC-1", {
        histories: [statusChange("2026-06-08T09:00:00.000Z", "To Do", "Ready for Integration Test")],
      }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const cycleTime = computeCycleTime(facts, issueSet);

    expect(cycleTime.withoutStartKeys).toEqual(["ENCUC-1"]);
    expect(cycleTime.points).toHaveLength(0);
  });
});

describe("cycle time", () => {
  it("reports percentiles over completed work", () => {
    const issues = Array.from({ length: 10 }, (_unused, index) =>
      buildIssue(`ENCUC-${index + 1}`, {
        histories: [
          statusChange("2026-06-01T09:00:00.000Z", "To Do", "In Progress"),
          statusChange(
            new Date(Date.parse("2026-06-01T09:00:00.000Z") + (index + 1) * 86_400_000).toISOString(),
            "In Progress",
            "Ready for Integration Test",
          ),
        ],
      }),
    );
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const cycleTime = computeCycleTime(facts, issueSet);

    expect(cycleTime.points).toHaveLength(10);
    expect(cycleTime.percentiles.get(85)).toBeGreaterThan(cycleTime.percentiles.get(50) ?? 0);
  });

  it("excludes weekends, so a Friday-to-Monday item is hours old and not days", () => {
    const issues = [
      buildIssue("ENCUC-1", {
        histories: [
          // Friday afternoon to Monday morning.
          statusChange("2026-06-05T15:00:00.000Z", "To Do", "In Progress"),
          statusChange("2026-06-08T09:00:00.000Z", "In Progress", "Ready for Integration Test"),
        ],
      }),
    ];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);

    const cycleTime = computeCycleTime(facts, issueSet);

    expect(cycleTime.points[0]?.cycleTimeDays).toBeLessThan(1);
  });
});

describe("ageing work", () => {
  it("marks items already older than the 85th percentile of finished work", () => {
    const finished = Array.from({ length: 5 }, (_unused, index) =>
      buildIssue(`ENCUC-${index + 1}`, {
        histories: [
          statusChange("2026-06-01T09:00:00.000Z", "To Do", "In Progress"),
          statusChange("2026-06-02T09:00:00.000Z", "In Progress", "Ready for Integration Test"),
        ],
      }),
    );
    const stuck = buildIssue("ENCUC-99", {
      statusName: "In Progress",
      histories: [statusChange("2026-06-01T09:00:00.000Z", "To Do", "In Progress")],
    });
    const issues = [...finished, stuck];
    const issueSet = buildSet(issues);
    const configuration = buildConfiguration();
    const lens = resolveLens("delivered-to-int", configuration, issues);
    const facts = buildFlowFacts(issueSet, lens, configuration.workingCalendar);
    const cycleTime = computeCycleTime(facts, issueSet);

    const aging = computeAgingWork(facts, issueSet, cycleTime, Date.parse("2026-07-01T09:00:00.000Z"));

    expect(aging.items[0]?.issueKey).toBe("ENCUC-99");
    expect(aging.items[0]?.isOlderThanUsual).toBe(true);
  });
});

describe("the two lenses cannot contradict each other", () => {
  it("reports a released item that never reached integration test", () => {
    const contradictions = findLensContradictions({
      deliveredKeys: new Set(["ENCUC-1"]),
      releasedKeys: new Set(["ENCUC-1", "ENCUC-2"]),
    });

    expect(contradictions).toEqual(["ENCUC-2"]);
  });

  it("finds nothing when production is a subset of integration", () => {
    const contradictions = findLensContradictions({
      deliveredKeys: new Set(["ENCUC-1", "ENCUC-2"]),
      releasedKeys: new Set(["ENCUC-1"]),
    });

    expect(contradictions).toHaveLength(0);
  });
});

describe("the query that reproduces a figure", () => {
  it("emits a CHANGED TO ... DURING clause scoped to the original query", () => {
    const jql = buildVerifyingJql({
      lens: buildConfiguration().completionLenses["delivered-to-int"],
      scopeJql: "project = ENCUC OR project = DENP",
      completionStatuses: new Set(["Ready for Integration Test"]),
      periodStartIsoDate: "2026-06-01",
      periodEndIsoDate: "2026-06-30",
    });

    expect(jql).toContain('status CHANGED TO ("Ready for Integration Test")');
    expect(jql).toContain('DURING ("2026-06-01", "2026-06-30")');
    // The scope is parenthesised, so its OR cannot swallow the condition.
    expect(jql).toContain("(project = ENCUC OR project = DENP) AND");
  });
});
