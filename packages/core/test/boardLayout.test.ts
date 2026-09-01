// boardLayout.test.ts — Lanes, bands, and the card that must not disappear.
//
// Two invariants carry this feature. Every retrieved issue is drawn exactly
// once, and a refinement's bands hold exactly the cards its column held. Neither
// failure is visible by looking at the board — a card drawn twice or silently
// absent looks like an ordinary board — which is what makes them worth
// asserting rather than reviewing.

import { describe, expect, it } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import type { FieldMap } from "../src/workspace/workspaceConfig.js";
import { UNMAPPED_COLUMN_ID } from "../src/board/boardSpine.js";
import type { BoardSpine } from "../src/board/boardSpine.js";
import {
  NO_FEATURE_LANE_ID,
  assertEveryIssueAppearsOnce,
  buildBoardLayout,
} from "../src/board/boardLayout.js";
import {
  UNCLASSIFIED_BAND_ID,
  assertBandsHoldEveryCard,
  assignCardsToBands,
  hasCardMarker,
  validateRefinements,
} from "../src/board/columnRefinement.js";
import type { ColumnRefinement } from "../src/board/columnRefinement.js";

/** The sub-status field on this fictional instance. */
const SUB_STATUS_FIELD = "customfield_10500";

/** The parent-feature field on this fictional instance. */
const FEATURE_LINK_FIELD = "customfield_10108";

/** A board with four columns plus the catch-all. */
const SPINE: BoardSpine = {
  boardId: 42,
  boardName: "ENCUC Delivery",
  boardType: "kanban",
  columns: [
    { columnId: "col-0", columnName: "To Do", statusIds: ["1"], isUnmappedColumn: false },
    { columnId: "col-1", columnName: "In Progress", statusIds: ["3"], isUnmappedColumn: false },
    { columnId: "col-2", columnName: "Testing", statusIds: ["10002"], isUnmappedColumn: false },
    { columnId: "col-3", columnName: "Done", statusIds: ["6"], isUnmappedColumn: false },
    { columnId: UNMAPPED_COLUMN_ID, columnName: "Not on this board", statusIds: [], isUnmappedColumn: true },
  ],
  fetchedAtIso: "2026-09-01T09:14:00.000Z",
};

/** A field map with both concepts confirmed. */
function buildFieldMap(): FieldMap {
  const base = buildDefaultWorkspaceConfiguration().fieldMap;
  return {
    ...base,
    parentFeature: {
      state: "resolved",
      fieldId: FEATURE_LINK_FIELD,
      jiraName: "Feature Link",
      matchedBy: "exact-name",
      confirmedAtIso: "2026-09-01T00:00:00.000Z",
    },
    programIncrement: {
      state: "resolved",
      fieldId: SUB_STATUS_FIELD,
      jiraName: "Test Stage",
      matchedBy: "exact-name",
      confirmedAtIso: "2026-09-01T00:00:00.000Z",
    },
  };
}

/** One issue. */
function buildIssue(
  key: string,
  options: {
    statusId?: string;
    statusCategory?: string;
    issueTypeName?: string;
    featureKey?: string;
    subStatus?: string;
    parentKey?: string;
    summary?: string;
  } = {},
) {
  const fields: Record<string, unknown> = {
    summary: options.summary ?? `Work on ${key}`,
    issuetype: { name: options.issueTypeName ?? "Story" },
    status: {
      id: options.statusId ?? "3",
      name: "In Progress",
      statusCategory: { key: options.statusCategory ?? "indeterminate" },
    },
    created: "2026-06-01T09:00:00.000Z",
  };
  if (options.featureKey !== undefined) fields[FEATURE_LINK_FIELD] = options.featureKey;
  if (options.subStatus !== undefined) fields[SUB_STATUS_FIELD] = options.subStatus;
  if (options.parentKey !== undefined) fields.parent = { key: options.parentKey };
  return normaliseRawIssue({ id: key, key, fields }, {});
}

/** An issue set, optionally truncated. */
function buildSet(issues: readonly ReturnType<typeof buildIssue>[], totalMatchingCount?: number) {
  const record = buildRetrievalRecord({
    jql: "board 42",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: totalMatchingCount ?? issues.length,
    fetchedCount: issues.length,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  return buildIssueSet(record, issues);
}

/** A refinement splitting Testing into three stages. */
const TEST_STAGE_REFINEMENT: ColumnRefinement = {
  refinementId: "test-stage",
  refinesColumnName: "Testing",
  splitByConcept: "programIncrement",
  unclassifiedLabel: "Testing — unclassified",
  bands: [
    { bandId: "int", label: "Internal test", equalsAnyOf: ["Internal"] },
    { bandId: "qe", label: "External QE test", equalsAnyOf: ["QE"] },
    { bandId: "bt", label: "External BT test", equalsAnyOf: ["BT"] },
  ],
};

describe("every issue appears exactly once", () => {
  it("draws each retrieved issue in one lane and one column", () => {
    const issueSet = buildSet([
      buildIssue("ENCUC-1", { featureKey: "DENP-100" }),
      buildIssue("ENCUC-2", { featureKey: "DENP-100", statusId: "6", statusCategory: "done" }),
      buildIssue("ENCUC-3", { featureKey: "DENP-200" }),
      buildIssue("DENP-100", { issueTypeName: "Feature", summary: "Enrollment rules" }),
    ]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });

    expect(() => assertEveryIssueAppearsOnce(layout, issueSet)).not.toThrow();
  });

  it("gives work with no Feature its own visible lane, with a count", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1"), buildIssue("ENCUC-2")]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });
    const orphanLane = layout.lanes.find((lane) => lane.laneId === NO_FEATURE_LANE_ID);

    expect(orphanLane?.issueCount).toBe(2);
  });

  it("keeps a Feature with no work, stated as having none", () => {
    const issueSet = buildSet([buildIssue("DENP-100", { issueTypeName: "Feature" })]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });

    expect(layout.lanes[0]?.hasNoWork).toBe(true);
  });

  it("gives a lane to a Feature referenced by work but not itself retrieved", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1", { featureKey: "DENP-999" })]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });

    expect(layout.lanes.map((lane) => lane.laneId)).toContain("DENP-999");
  });

  it("places a status the board maps nowhere in the visible catch-all column", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1", { statusId: "99999" })]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });
    const catchAll = layout.lanes[0]?.columns.find((column) => column.columnId === UNMAPPED_COLUMN_ID);

    expect(catchAll?.issues).toHaveLength(1);
  });
});

describe("lane figures describe the whole lane", () => {
  it("reports progress as a Measure openable to its own issues", () => {
    const issueSet = buildSet([
      buildIssue("ENCUC-1", { featureKey: "DENP-100", statusId: "6", statusCategory: "done" }),
      buildIssue("ENCUC-2", { featureKey: "DENP-100" }),
    ]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });
    const progress = layout.lanes[0]?.progress;

    expect(progress?.state).toBe("measured");
    expect(progress?.state === "measured" && progress.flaggedKeys).toEqual(["ENCUC-1"]);
    expect(progress?.state === "measured" && progress.eligibleKeys).toHaveLength(2);
  });

  it("says on the board when the retrieval was incomplete", () => {
    const issueSet = buildSet([buildIssue("ENCUC-1")], 4_317);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [],
      fieldMap: buildFieldMap(),
    });

    expect(layout.incompleteNotice).toMatch(/floor, not a total/i);
  });
});

describe("bands inside a column", () => {
  it("splits a column without creating one, and the totals still reconcile", () => {
    const issues = [
      buildIssue("ENCUC-1", { statusId: "10002", subStatus: "Internal" }),
      buildIssue("ENCUC-2", { statusId: "10002", subStatus: "QE" }),
      buildIssue("ENCUC-3", { statusId: "10002", subStatus: "BT" }),
    ];

    const column = assignCardsToBands({
      columnId: "col-2",
      columnName: "Testing",
      issues,
      refinement: TEST_STAGE_REFINEMENT,
      fieldMap: buildFieldMap(),
    });

    expect(column.bands.map((band) => band.label)).toEqual([
      "Internal test",
      "External QE test",
      "External BT test",
    ]);
    expect(() => assertBandsHoldEveryCard(column)).not.toThrow();
  });

  it("puts an unanticipated value in a visible unclassified band, in the same column", () => {
    const issues = [
      buildIssue("ENCUC-1", { statusId: "10002", subStatus: "Internal" }),
      buildIssue("ENCUC-2", { statusId: "10002", subStatus: "Something Nobody Declared" }),
    ];

    const column = assignCardsToBands({
      columnId: "col-2",
      columnName: "Testing",
      issues,
      refinement: TEST_STAGE_REFINEMENT,
      fieldMap: buildFieldMap(),
    });
    const unclassified = column.bands.find((band) => band.bandId === UNCLASSIFIED_BAND_ID);

    expect(unclassified?.issues.map((issue) => issue.key)).toEqual(["ENCUC-2"]);
    expect(() => assertBandsHoldEveryCard(column)).not.toThrow();
  });

  it("says which Jira column it refines and which field it splits by", () => {
    const column = assignCardsToBands({
      columnId: "col-2",
      columnName: "Testing",
      issues: [],
      refinement: TEST_STAGE_REFINEMENT,
      fieldMap: buildFieldMap(),
    });

    expect(column.splitDescription).toBe('Jira\'s "Testing" column, split by Test Stage');
  });

  it("renders unrefined with every card when the field is not confirmed", () => {
    const issues = [buildIssue("ENCUC-1", { statusId: "10002" })];

    const column = assignCardsToBands({
      columnId: "col-2",
      columnName: "Testing",
      issues,
      refinement: TEST_STAGE_REFINEMENT,
      fieldMap: buildDefaultWorkspaceConfiguration().fieldMap,
    });

    expect(column.bands).toHaveLength(0);
    expect(column.issues).toHaveLength(1);
    expect(column.unrefinedReason).toMatch(/Every card is still here/i);
  });

  it("refuses a banding that lost a card", () => {
    const brokenColumn = {
      columnId: "col-2",
      columnName: "Testing",
      issues: [buildIssue("ENCUC-1"), buildIssue("ENCUC-2")],
      bands: [{ bandId: "int", label: "Internal", issues: [buildIssue("ENCUC-1")], isUnclassified: false }],
      unrefinedReason: null,
      splitDescription: null,
    };

    expect(() => assertBandsHoldEveryCard(brokenColumn)).toThrow(/may never lose a card/i);
  });
});

describe("a stale refinement", () => {
  it("is reported when it names a column the board no longer has", () => {
    const stale: ColumnRefinement = { ...TEST_STAGE_REFINEMENT, refinesColumnName: "QA Review" };

    const validation = validateRefinements(SPINE, [stale], buildFieldMap());

    expect(validation.isValid).toBe(false);
    expect(validation.staleRefinements[0]?.refinesColumnName).toBe("QA Review");
    expect(validation.staleRefinements[0]?.liveColumnNames).toContain("Testing");
  });

  it("is reported when its concept has no confirmed field", () => {
    const validation = validateRefinements(
      SPINE,
      [TEST_STAGE_REFINEMENT],
      buildDefaultWorkspaceConfiguration().fieldMap,
    );

    expect(validation.unresolvedFields[0]?.conceptId).toBe("programIncrement");
  });

  it("leaves the column rendered with all its cards rather than losing them", () => {
    const issueSet = buildSet([
      buildIssue("ENCUC-1", { statusId: "10002", subStatus: "Internal" }),
      buildIssue("ENCUC-2", { statusId: "10002", subStatus: "QE" }),
    ]);

    const layout = buildBoardLayout({
      issueSet,
      spine: SPINE,
      refinements: [TEST_STAGE_REFINEMENT],
      fieldMap: buildFieldMap(),
      staleColumnNames: new Set(["Testing"]),
    });
    const testing = layout.lanes[0]?.columns.find((column) => column.columnName === "Testing");

    expect(testing?.issues).toHaveLength(2);
    expect(testing?.bands).toHaveLength(0);
    expect(testing?.unrefinedReason).toMatch(/every card still in it/i);
  });
});

describe("card markers", () => {
  const CODE_REVIEW_MARKER = {
    markerId: "code-review",
    label: "In code review",
    childIssueTypeNames: ["Sub-task"],
    childSummaryContains: "code review",
  };

  it("raises a badge for an open matching child", () => {
    const parent = buildIssue("ENCUC-1");
    const child = buildIssue("ENCUC-1-1", {
      issueTypeName: "Sub-task",
      parentKey: "ENCUC-1",
      summary: "Code review for the eligibility rules",
    });

    expect(hasCardMarker(parent, [child], CODE_REVIEW_MARKER)).toBe(true);
  });

  it("does not raise it for a child that is already finished", () => {
    const parent = buildIssue("ENCUC-1");
    const child = buildIssue("ENCUC-1-1", {
      issueTypeName: "Sub-task",
      parentKey: "ENCUC-1",
      summary: "Code review",
      statusCategory: "done",
    });

    // A finished code-review sub-task means the review happened, which is the
    // opposite of what the badge would say.
    expect(hasCardMarker(parent, [child], CODE_REVIEW_MARKER)).toBe(false);
  });

  it("does not raise it for another issue's child", () => {
    const parent = buildIssue("ENCUC-1");
    const child = buildIssue("ENCUC-2-1", {
      issueTypeName: "Sub-task",
      parentKey: "ENCUC-2",
      summary: "Code review",
    });

    expect(hasCardMarker(parent, [child], CODE_REVIEW_MARKER)).toBe(false);
  });

  it("does not raise it for a child of the wrong type", () => {
    const parent = buildIssue("ENCUC-1");
    const child = buildIssue("ENCUC-1-1", {
      issueTypeName: "Story",
      parentKey: "ENCUC-1",
      summary: "Code review",
    });

    expect(hasCardMarker(parent, [child], CODE_REVIEW_MARKER)).toBe(false);
  });
});
