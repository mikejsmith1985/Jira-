// completionLens.ts — Two definitions of finished, both checkable.
//
// "Delivered to integration test" is the team's Definition of Done and the lens
// their Program Increment commitments are judged by. "Released to production"
// is the later milestone, and it reconciles with a report run in Jira untouched.
//
// Having both is worth more than either alone. The production figure is the one
// nobody can argue with; the integration figure is the one that reflects what
// the team actually controls. A director can verify the boring number and then
// look at the one that matters.
//
// Each lens emits the JQL that reproduces it. Data Center supports
// `status CHANGED TO … DURING` against the same history this module reads, so
// the chart and the query agree by construction rather than by coincidence.

import type { DetailedIssue } from "../model/detailedIssue.js";
import { combineJql, escapeJqlValue } from "../jira/jqlValue.js";
import type {
  CompletionLens,
  CompletionLensId,
  StatusCondition,
  WorkspaceConfiguration,
} from "../workspace/workspaceConfig.js";
import { findFirstEntryMs, findLastEntryMs } from "./issueTimeline.js";
import type { IssueTimeline } from "./issueTimeline.js";

/** Which statuses satisfy a condition, given the statuses actually seen. */
export function resolveConditionStatuses(
  condition: StatusCondition,
  issues: readonly DetailedIssue[],
): ReadonlySet<string> {
  if (condition.kind === "named-statuses") return new Set(condition.statusNames);

  // A category condition is expanded against the statuses this retrieval saw,
  // so it works on any instance without anybody naming its statuses.
  const matching = issues
    .filter((issue) => issue.statusCategoryKey === condition.category)
    .map((issue) => issue.statusName);
  return new Set(matching);
}

/** Whether a lens can be evaluated at all. */
export function isLensDefined(lens: CompletionLens): boolean {
  if (lens.completedWhen.kind === "category") return true;
  return lens.completedWhen.statusNames.length > 0;
}

/**
 * When an issue was completed under this lens, or null.
 *
 * Uses the LAST qualifying entry: an item that regressed and was finished again
 * counts once, in the later period, so a regression cannot inflate a week.
 */
export function findCompletionMs(
  timeline: IssueTimeline,
  completionStatuses: ReadonlySet<string>,
): number | null {
  if (!timeline.isReconstructable) return null;
  return findLastEntryMs(timeline, completionStatuses);
}

/**
 * When work on an issue started, or null.
 *
 * Uses the FIRST entry, ever. An item worked, parked and resumed carries its
 * true age rather than a flattering restart.
 */
export function findStartMs(
  timeline: IssueTimeline,
  startedStatuses: ReadonlySet<string>,
): number | null {
  if (!timeline.isReconstructable) return null;
  return findFirstEntryMs(timeline, startedStatuses);
}

/**
 * The query that reproduces this lens's completed set for a period.
 *
 * This is the promise the whole product rests on: a figure somebody can check
 * without the tool. Status is one of the six fields Data Center's history
 * operators support, which is exactly what both lenses are defined on.
 */
export function buildVerifyingJql(input: {
  readonly lens: CompletionLens;
  readonly scopeJql: string;
  readonly completionStatuses: ReadonlySet<string>;
  readonly periodStartIsoDate: string;
  readonly periodEndIsoDate: string;
}): string {
  const statusList = [...input.completionStatuses]
    .map((statusName) => `"${escapeJqlValue(statusName)}"`)
    .join(", ");

  const condition =
    `status CHANGED TO (${statusList}) ` +
    `DURING ("${input.periodStartIsoDate}", "${input.periodEndIsoDate}")`;

  return combineJql(input.scopeJql, condition);
}

/** Everything a caller needs to evaluate one lens over one retrieval. */
export interface ResolvedLens {
  readonly lens: CompletionLens;
  readonly completionStatuses: ReadonlySet<string>;
  readonly startedStatuses: ReadonlySet<string>;
  readonly isDefined: boolean;
}

/** Resolves a lens against the statuses this retrieval actually contains. */
export function resolveLens(
  lensId: CompletionLensId,
  configuration: WorkspaceConfiguration,
  issues: readonly DetailedIssue[],
): ResolvedLens {
  const lens = configuration.completionLenses[lensId];
  return {
    lens,
    completionStatuses: resolveConditionStatuses(lens.completedWhen, issues),
    startedStatuses: resolveConditionStatuses(lens.startedWhen, issues),
    isDefined: isLensDefined(lens),
  };
}

/** How a lens describes itself above a chart, in words a reader can act on. */
export function describeLens(resolved: ResolvedLens): string {
  const statuses = [...resolved.completionStatuses];
  if (statuses.length === 0) {
    return `${resolved.lens.label}: no status has been named for this yet, so nothing can be counted.`;
  }
  return (
    `${resolved.lens.label}: an item counts as finished when it enters ` +
    `${statuses.map((status) => `"${status}"`).join(" or ")}.`
  );
}

/**
 * Checks the containment the two lenses must satisfy.
 *
 * Everything released to production must have reached integration test at some
 * point. The reverse failing is a data or configuration fault, and is reported
 * as one — a tool that can show its own contradiction and calls it a result is
 * back where the predecessor was.
 */
export function findLensContradictions(input: {
  readonly deliveredKeys: ReadonlySet<string>;
  readonly releasedKeys: ReadonlySet<string>;
}): readonly string[] {
  return [...input.releasedKeys].filter((key) => !input.deliveredKeys.has(key));
}
