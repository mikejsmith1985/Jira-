// boardLayout.ts — Features as lanes, over Jira's own columns.
//
// The arrangement the author actually values: the whole picture at once, each
// Feature a lane, every issue in the column of its own status.
//
// Two rules keep it honest. Every retrieved issue appears exactly once — no
// card is drawn twice and none disappears, including work belonging to no
// Feature, which gets a visible lane of its own with a live count. And a lane's
// headline figure is computed BEFORE any filter is applied, so filtering the
// board narrows what is shown without quietly rewriting what it claims.

import { measure } from "../measure/measure.js";
import type { Measure } from "../measure/measure.js";
import type { ConceptId } from "../fields/conceptId.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";
import type { FieldMap } from "../workspace/workspaceConfig.js";
import { resolveColumnForStatus } from "./boardSpine.js";
import type { BoardSpine } from "./boardSpine.js";
import { assertBandsHoldEveryCard, assignCardsToBands } from "./columnRefinement.js";
import type { BandedColumn, ColumnRefinement } from "./columnRefinement.js";

/** The lane holding work no Feature claims. */
export const NO_FEATURE_LANE_ID = "__no-feature";

/** What that lane is called on screen. */
export const NO_FEATURE_LANE_NAME = "No Feature";

/** One Feature and everything beneath it. */
export interface BoardLane {
  readonly laneId: string;
  readonly laneName: string;
  /** The Feature itself, when it was retrieved. Null for the catch-all lane. */
  readonly feature: DetailedIssue | null;
  readonly columns: readonly BandedColumn[];
  /** Progress, computed over the UNFILTERED lane so filtering cannot rewrite it. */
  readonly progress: Measure;
  readonly issueCount: number;
  /** True when the Feature is in scope but has no work beneath it. */
  readonly hasNoWork: boolean;
}

/** The whole board. */
export interface BoardLayout {
  readonly spine: BoardSpine;
  readonly lanes: readonly BoardLane[];
  /** Set when the retrieval was incomplete, so no lane figure claims to be a total. */
  readonly incompleteNotice: string | null;
}

/**
 * Finds an issue's Feature.
 *
 * Tries the mapped parent-feature concept, then Jira's native parent. That order
 * matters: a team using a dedicated Feature Link field means it, and native
 * parent would give the wrong answer for a story under an epic under a feature.
 */
function resolveFeatureKey(
  issue: DetailedIssue,
  fieldMap: FieldMap,
  parentFeatureConcept: ConceptId = "parentFeature",
): string | null {
  const entry = fieldMap[parentFeatureConcept];

  if (entry.state === "resolved") {
    const rawValue = issue.fields.get(entry.fieldId);
    if (typeof rawValue === "string" && rawValue.trim().length > 0) return rawValue.trim();
    if (rawValue !== null && typeof rawValue === "object") {
      const key = (rawValue as Record<string, unknown>).key;
      if (typeof key === "string") return key;
    }
  }

  const parent = issue.fields.get("parent");
  if (parent !== null && typeof parent === "object") {
    const key = (parent as Record<string, unknown>).key;
    if (typeof key === "string") return key;
  }

  return null;
}

/** Is this issue itself a Feature, rather than work beneath one? */
function isFeatureIssue(issue: DetailedIssue): boolean {
  const typeName = issue.issueTypeName.trim().toLowerCase();
  return typeName === "feature" || typeName === "epic";
}

/** Distributes one lane's issues into the board's columns. */
function buildLaneColumns(
  laneIssues: readonly DetailedIssue[],
  spine: BoardSpine,
  refinements: readonly ColumnRefinement[],
  fieldMap: FieldMap,
  staleColumnNames: ReadonlySet<string>,
): readonly BandedColumn[] {
  return spine.columns.map((column) => {
    const columnIssues = laneIssues.filter(
      (issue) => resolveColumnForStatus(spine, issue.statusId).columnId === column.columnId,
    );

    const refinement = refinements.find(
      (candidate) => candidate.refinesColumnName === column.columnName,
    );

    const banded = assignCardsToBands({
      columnId: column.columnId,
      columnName: column.columnName,
      issues: columnIssues,
      // A stale refinement renders the column unrefined WITH all its cards.
      refinement: staleColumnNames.has(column.columnName) ? undefined : refinement,
      fieldMap,
      ...(staleColumnNames.has(column.columnName)
        ? {
            unrefinedReason:
              `A refinement refers to a column named "${column.columnName}" that the board no ` +
              `longer has. This column is shown unrefined, with every card still in it.`,
          }
        : {}),
    });

    assertBandsHoldEveryCard(banded);
    return banded;
  });
}

/** Which issues count as finished, for a lane's progress figure. */
function findCompletedKeys(issues: readonly DetailedIssue[]): readonly string[] {
  return issues.filter((issue) => issue.statusCategoryKey === "done").map((issue) => issue.key);
}

/**
 * Arranges a retrieval into Feature lanes over the board's own columns.
 *
 * Every retrieved issue lands in exactly one lane and one column. Work with no
 * discoverable Feature gets its own visible lane rather than being dropped,
 * because a board that hides what it cannot classify is a board that lies by
 * omission.
 */
export function buildBoardLayout(input: {
  readonly issueSet: IssueSet;
  readonly spine: BoardSpine;
  readonly refinements: readonly ColumnRefinement[];
  readonly fieldMap: FieldMap;
  readonly staleColumnNames?: ReadonlySet<string>;
}): BoardLayout {
  const staleColumnNames = input.staleColumnNames ?? new Set<string>();

  const features = input.issueSet.issues.filter(isFeatureIssue);
  const work = input.issueSet.issues.filter((issue) => !isFeatureIssue(issue));

  const workByFeatureKey = new Map<string, DetailedIssue[]>();
  const orphans: DetailedIssue[] = [];

  for (const issue of work) {
    const featureKey = resolveFeatureKey(issue, input.fieldMap);
    if (featureKey === null) {
      orphans.push(issue);
      continue;
    }
    const group = workByFeatureKey.get(featureKey) ?? [];
    group.push(issue);
    workByFeatureKey.set(featureKey, group);
  }

  // A Feature referenced by work but not itself retrieved still earns a lane —
  // its children are real and have to go somewhere truthful.
  const featureKeys = new Set([
    ...features.map((feature) => feature.key),
    ...workByFeatureKey.keys(),
  ]);

  const lanes: BoardLane[] = [...featureKeys].sort().map((featureKey) => {
    const feature = features.find((candidate) => candidate.key === featureKey) ?? null;
    const laneIssues = workByFeatureKey.get(featureKey) ?? [];

    return {
      laneId: featureKey,
      laneName:
        feature === null
          ? featureKey
          : `${featureKey} — ${String(feature.fields.get("summary") ?? "")}`,
      feature,
      columns: buildLaneColumns(
        laneIssues,
        input.spine,
        input.refinements,
        input.fieldMap,
        staleColumnNames,
      ),
      // Computed over the whole lane, before any filter narrows the view.
      progress: measure({
        sourceId: `lane-${featureKey}`,
        flaggedKeys: findCompletedKeys(laneIssues),
        eligibleKeys: laneIssues.map((issue) => issue.key),
        issueSet: input.issueSet,
      }),
      issueCount: laneIssues.length,
      hasNoWork: laneIssues.length === 0,
    };
  });

  if (orphans.length > 0) {
    lanes.push({
      laneId: NO_FEATURE_LANE_ID,
      laneName: NO_FEATURE_LANE_NAME,
      feature: null,
      columns: buildLaneColumns(
        orphans,
        input.spine,
        input.refinements,
        input.fieldMap,
        staleColumnNames,
      ),
      progress: measure({
        sourceId: "lane-no-feature",
        flaggedKeys: findCompletedKeys(orphans),
        eligibleKeys: orphans.map((issue) => issue.key),
        issueSet: input.issueSet,
      }),
      issueCount: orphans.length,
      hasNoWork: false,
    });
  }

  return {
    spine: input.spine,
    lanes,
    incompleteNotice: input.issueSet.record.isTruncated
      ? `This board shows ${input.issueSet.record.fetchedCount} of ` +
        `${input.issueSet.record.totalMatchingCount} matching issues. Every figure on it is a ` +
        `floor, not a total.`
      : null,
  };
}

/**
 * Confirms the layout drew every retrieved issue exactly once.
 *
 * The likeliest bug on a board of this shape is a card rendered twice or not at
 * all, and neither is visible by looking — which is what makes it worth
 * asserting rather than reviewing.
 */
export function assertEveryIssueAppearsOnce(layout: BoardLayout, issueSet: IssueSet): void {
  const seen = new Map<string, number>();

  for (const lane of layout.lanes) {
    for (const column of lane.columns) {
      for (const issue of column.issues) {
        seen.set(issue.key, (seen.get(issue.key) ?? 0) + 1);
      }
    }
  }

  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicated.length > 0) {
    throw new Error(`These issues were drawn more than once: ${duplicated.join(", ")}.`);
  }

  const missing = issueSet.issues
    .filter((issue) => !isFeatureIssue(issue))
    .filter((issue) => !seen.has(issue.key))
    .map((issue) => issue.key);

  if (missing.length > 0) {
    throw new Error(
      `These issues were retrieved but appear nowhere on the board: ${missing.join(", ")}. ` +
        `A board that hides work is worse than no board.`,
    );
  }
}
