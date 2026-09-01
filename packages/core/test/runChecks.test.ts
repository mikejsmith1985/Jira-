// runChecks.test.ts — The trust demo, asserted.
//
// The five-minute demonstration this product is sold on: unmap a field, watch
// the tile go amber instead of green, and see that the check needing no mapping
// keeps working. These tests are that demonstration, mechanised — plus the
// structural rules that stop a future check reintroducing the old failure.

import { describe, expect, it } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import type { WorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import { ALL_CHECKS, ALL_CHECK_IDS, findCheck } from "../src/checks/registry.js";
import { runChecks, summariseChecks } from "../src/checks/runChecks.js";
import { isDeliveryIssueType } from "../src/checks/defineCheck.js";

/** The acceptance-criteria field on this fictional instance. */
const ACCEPTANCE_CRITERIA_FIELD = "customfield_10301";

/** The story-points field on this fictional instance — deliberately NOT 10028. */
const STORY_POINTS_FIELD = "customfield_10236";

/** One issue, with whichever fields the test needs. */
function buildIssue(
  key: string,
  options: {
    issueTypeName?: string;
    storyPoints?: number | null;
    acceptanceCriteria?: string | null;
    fixVersions?: readonly unknown[];
  } = {},
) {
  const fields: Record<string, unknown> = {
    summary: `Work on ${key}`,
    issuetype: { name: options.issueTypeName ?? "Story" },
    status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
    created: "2026-06-01T09:00:00.000Z",
    fixVersions: options.fixVersions ?? [],
  };
  if (options.storyPoints !== undefined && options.storyPoints !== null) {
    fields[STORY_POINTS_FIELD] = options.storyPoints;
  }
  if (options.acceptanceCriteria !== undefined && options.acceptanceCriteria !== null) {
    fields[ACCEPTANCE_CRITERIA_FIELD] = options.acceptanceCriteria;
  }
  return normaliseRawIssue({ id: key, key, fields }, {});
}

/** An issue set, optionally one whose retrieval failed. */
function buildSet(issues: readonly ReturnType<typeof buildIssue>[], hasFailed = false) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: hasFailed ? 0 : issues.length,
    fetchedCount: hasFailed ? 0 : issues.length,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: hasFailed ? { kind: "jql-error", jiraMessages: ["Field 'cf[99999]' does not exist"] } : null,
  });
  return buildIssueSet(record, hasFailed ? [] : issues);
}

/** A configuration with both concepts confirmed. */
function buildMappedConfiguration(): WorkspaceConfiguration {
  const base = buildDefaultWorkspaceConfiguration();
  return {
    ...base,
    fieldMap: {
      ...base.fieldMap,
      storyPoints: {
        state: "resolved",
        fieldId: STORY_POINTS_FIELD,
        jiraName: "Story Points",
        matchedBy: "exact-name",
        confirmedAtIso: "2026-09-01T00:00:00.000Z",
      },
      acceptanceCriteria: {
        state: "resolved",
        fieldId: ACCEPTANCE_CRITERIA_FIELD,
        jiraName: "Acceptance Criteria",
        matchedBy: "exact-name",
        confirmedAtIso: "2026-09-01T00:00:00.000Z",
      },
    },
  };
}

/** Finds one check's result by identifier. */
function resultFor(results: ReturnType<typeof runChecks>, checkId: string) {
  return results.find((result) => result.check.checkId === checkId);
}

describe("the registry is the only list", () => {
  it("derives the identifier list from the definitions themselves", () => {
    expect(ALL_CHECK_IDS).toEqual(ALL_CHECKS.map((check) => check.checkId));
  });

  it("has no duplicate identifiers", () => {
    expect(new Set(ALL_CHECK_IDS).size).toBe(ALL_CHECK_IDS.length);
  });

  it("can find every check it lists, so none is evaluated and then hidden", () => {
    for (const checkId of ALL_CHECK_IDS) expect(findCheck(checkId)).toBeDefined();
  });

  it("gives every check a reason a person can act on", () => {
    for (const check of ALL_CHECKS) {
      expect(check.whyItMatters.length).toBeGreaterThan(20);
    }
  });
});

describe("the trust demo", () => {
  const issues = [
    buildIssue("ENCUC-1", { storyPoints: 5, acceptanceCriteria: "Given…", fixVersions: [{ name: "2026.09" }] }),
    buildIssue("ENCUC-2", { storyPoints: 3, acceptanceCriteria: null, fixVersions: [] }),
    buildIssue("ENCUC-3", { storyPoints: null, acceptanceCriteria: "Given…", fixVersions: [] }),
  ];

  it("reports N of M when the concepts are confirmed", () => {
    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);
    const acceptance = resultFor(results, "missing-acceptance-criteria")?.measure;

    expect(acceptance?.state).toBe("measured");
    expect(acceptance?.state === "measured" && acceptance.flaggedKeys).toEqual(["ENCUC-2"]);
    expect(acceptance?.state === "measured" && acceptance.eligibleKeys).toHaveLength(3);
  });

  it("turns AMBER, not green, when the field is unmapped", () => {
    const configuration = buildMappedConfiguration();
    const unmapped = {
      ...configuration,
      fieldMap: { ...configuration.fieldMap, acceptanceCriteria: { state: "unmapped" as const } },
    };

    const results = runChecks(buildSet(issues), unmapped, []);
    const acceptance = resultFor(results, "missing-acceptance-criteria")?.measure;

    expect(acceptance?.state).toBe("unresolved");
    expect(acceptance?.state === "unresolved" && acceptance.blocker.kind).toBe("concept-unmapped");
  });

  it("keeps the check needing no mapping measurable while the others cannot run", () => {
    const base = buildDefaultWorkspaceConfiguration();
    const results = runChecks(buildSet(issues), base, []);

    expect(resultFor(results, "missing-story-points")?.measure.state).toBe("unresolved");
    expect(resultFor(results, "missing-acceptance-criteria")?.measure.state).toBe("unresolved");
    expect(resultFor(results, "missing-fix-version")?.measure.state).toBe("measured");
  });

  it("reports a confirmed absence as inapplicable rather than as blocking", () => {
    const configuration = buildMappedConfiguration();
    const absent = {
      ...configuration,
      fieldMap: {
        ...configuration.fieldMap,
        acceptanceCriteria: { state: "absent" as const, confirmedAtIso: "2026-09-01T00:00:00.000Z" },
      },
    };

    const results = runChecks(buildSet(issues), absent, []);

    expect(resultFor(results, "missing-acceptance-criteria")?.measure.state).toBe("not-applicable");
  });
});

describe("the seventy-two", () => {
  it("applies missing-fix-version to stories, tasks and defects, not only features", () => {
    const issues = [
      buildIssue("ENCUC-1", { issueTypeName: "Story", fixVersions: [] }),
      buildIssue("ENCUC-2", { issueTypeName: "Task", fixVersions: [] }),
      buildIssue("ENCUC-3", { issueTypeName: "Defect", fixVersions: [] }),
      buildIssue("ENCUC-4", { issueTypeName: "Feature", fixVersions: [] }),
    ];

    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);
    const fixVersion = resultFor(results, "missing-fix-version")?.measure;

    expect(fixVersion?.state === "measured" && fixVersion.flaggedKeys).toHaveLength(4);
  });

  it("excludes sub-tasks, which cannot carry a fix version of their own", () => {
    const issues = [
      buildIssue("ENCUC-1", { issueTypeName: "Story", fixVersions: [] }),
      buildIssue("ENCUC-2", { issueTypeName: "Sub-task", fixVersions: [] }),
    ];

    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);
    const fixVersion = resultFor(results, "missing-fix-version")?.measure;

    expect(fixVersion?.state === "measured" && fixVersion.eligibleKeys).toEqual(["ENCUC-1"]);
  });

  it("does not treat the delivery population as 'feature-like'", () => {
    expect(isDeliveryIssueType(buildIssue("A", { issueTypeName: "Story" }))).toBe(true);
    expect(isDeliveryIssueType(buildIssue("B", { issueTypeName: "Sub-task" }))).toBe(false);
  });

  it("builds a drill-through using the JQL alias, not the REST field name", () => {
    const issues = [buildIssue("ENCUC-1", { fixVersions: [] })];
    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);
    const jql = resultFor(results, "missing-fix-version")?.drillThroughJql ?? "";

    expect(jql).toContain("fixVersion is EMPTY");
    expect(jql).not.toContain("fixVersions is EMPTY");
  });
});

describe("the population is the denominator", () => {
  it("counts only issues the check applies to", () => {
    const issues = [
      buildIssue("ENCUC-1", { issueTypeName: "Story", storyPoints: null }),
      buildIssue("ENCUC-2", { issueTypeName: "Epic", storyPoints: null }),
    ];

    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);
    const points = resultFor(results, "missing-story-points")?.measure;

    // Epics are sized elsewhere, so only the story is in the population.
    expect(points?.state === "measured" && points.eligibleKeys).toEqual(["ENCUC-1"]);
  });

  it("reports nothing-in-scope rather than a pass when no issue qualifies", () => {
    const issues = [buildIssue("ENCUC-1", { issueTypeName: "Sub-task" })];
    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);

    expect(resultFor(results, "missing-story-points")?.measure.state).toBe("not-applicable");
  });
});

describe("a failed retrieval", () => {
  it("makes every check unresolved", () => {
    const results = runChecks(buildSet([], true), buildMappedConfiguration(), []);

    expect(results.every((result) => result.measure.state === "unresolved")).toBe(true);
  });

  it("leaves no overall score at all", () => {
    const summary = summariseChecks(runChecks(buildSet([], true), buildMappedConfiguration(), []));

    expect(summary.passRate).toBeNull();
    expect(summary.measuredCount).toBe(0);
  });
});

describe("aggregates exclude what could not be measured", () => {
  it("does not let an unmeasurable check average into a comfortable score", () => {
    const issues = [buildIssue("ENCUC-1", { fixVersions: [{ name: "2026.09" }] })];
    // Neither concept is mapped, so two checks are unresolved and one passes.
    const results = runChecks(buildSet(issues), buildDefaultWorkspaceConfiguration(), []);
    const summary = summariseChecks(results);

    expect(summary.measuredCount).toBe(1);
    expect(summary.notMeasurableCount).toBe(2);
    expect(summary.passRate).toBe(1);
  });
});

describe("which field was read", () => {
  it("names the concept and the Jira field behind it, so the mapping is auditable", () => {
    const issues = [buildIssue("ENCUC-1", { storyPoints: 5 })];
    const results = runChecks(buildSet(issues), buildMappedConfiguration(), []);

    expect(resultFor(results, "missing-story-points")?.fieldsRead).toEqual([
      { conceptId: "storyPoints", fieldId: STORY_POINTS_FIELD, jiraName: "Story Points" },
    ]);
  });
});

describe("disabled checks", () => {
  it("does not evaluate a check the installation turned off", () => {
    const configuration = { ...buildMappedConfiguration(), enabledCheckIds: ["missing-fix-version"] };
    const results = runChecks(buildSet([buildIssue("ENCUC-1")]), configuration, []);

    expect(results).toHaveLength(1);
    expect(results[0]?.check.checkId).toBe("missing-fix-version");
  });
});
