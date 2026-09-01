// flowMeasures.ts — The six figures, all from one retrieval, none from a sprint.
//
// Sprint membership is not an input to any function here. That is why these
// numbers survive the move to Kanban, and why carry-over stops being able to
// hide the real rate: there is no boundary for work to be carried across.
//
// Every measure returns a `Measure`, so a retrieval that failed or a lens that
// was never defined produces an explicit unresolved state rather than an empty
// chart that reads as "no work happened".

import { measure } from "../measure/measure.js";
import type { Measure } from "../measure/measure.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";
import type { WorkingCalendar } from "../workspace/workspaceConfig.js";
import { allocateHolderCredit, summariseHolderTotals } from "./attribution.js";
import type { HolderTotal } from "./attribution.js";
import { findCompletionMs, findStartMs } from "./completionLens.js";
import type { ResolvedLens } from "./completionLens.js";
import { buildIssueTimeline } from "./issueTimeline.js";
import type { IssueTimeline } from "./issueTimeline.js";
import { businessDaysBetween, toIsoWeek } from "./workingDays.js";

/** How many weeks the rolling mean covers. */
const ROLLING_MEAN_WEEKS = 4;

/** The percentiles reported on the cycle-time distribution. */
export const REPORTED_PERCENTILES = [50, 85, 95] as const;

/** One issue, with everything the measures need already resolved. */
export interface FlowFact {
  readonly issue: DetailedIssue;
  readonly timeline: IssueTimeline;
  readonly startedMs: number | null;
  readonly completedMs: number | null;
  readonly cycleTimeDays: number | null;
}

/** The facts, plus an honest account of what could not be included. */
export interface FlowFactSet {
  readonly facts: readonly FlowFact[];
  /** Issues whose history was never retrieved. Excluded and counted, never zeroed. */
  readonly excludedKeys: readonly string[];
  readonly lens: ResolvedLens;
  readonly calendar: WorkingCalendar;
}

/**
 * Resolves every issue against one lens.
 *
 * An issue with no retrieved history is excluded and named. It is not treated as
 * unfinished, because "we do not know" and "it did not finish" are different
 * claims and only one of them is supported.
 */
export function buildFlowFacts(
  issueSet: IssueSet,
  lens: ResolvedLens,
  calendar: WorkingCalendar,
): FlowFactSet {
  const facts: FlowFact[] = [];
  const excludedKeys: string[] = [];

  for (const issue of issueSet.issues) {
    const timeline = buildIssueTimeline(issue);

    if (!timeline.isReconstructable) {
      excludedKeys.push(issue.key);
      continue;
    }

    const startedMs = findStartMs(timeline, lens.startedStatuses);
    const completedMs = findCompletionMs(timeline, lens.completionStatuses);
    const cycleTimeDays =
      startedMs !== null && completedMs !== null && completedMs > startedMs
        ? businessDaysBetween(startedMs, completedMs, calendar)
        : null;

    facts.push({ issue, timeline, startedMs, completedMs, cycleTimeDays });
  }

  return { facts, excludedKeys, lens, calendar };
}

/** Wraps a set of keys as a Measure over the retrieval that produced them. */
function measureKeys(
  sourceId: string,
  flaggedKeys: readonly string[],
  eligibleKeys: readonly string[],
  issueSet: IssueSet,
  factSet: FlowFactSet,
): Measure {
  if (!factSet.lens.isDefined) {
    return measure({
      sourceId,
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet,
      lensId: factSet.lens.lens.lensId,
      blocker: { kind: "lens-undefined", lensId: factSet.lens.lens.lensId },
    });
  }

  if (factSet.excludedKeys.length > 0 && factSet.facts.length === 0) {
    return measure({
      sourceId,
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet,
      lensId: factSet.lens.lens.lensId,
      blocker: { kind: "history-unavailable", affectedCount: factSet.excludedKeys.length },
    });
  }

  return measure({
    sourceId,
    flaggedKeys,
    eligibleKeys,
    issueSet,
    lensId: factSet.lens.lens.lensId,
  });
}

/** One week's completed count. */
export interface ThroughputWeek {
  readonly isoWeek: string;
  readonly completedKeys: readonly string[];
  readonly rollingMean: number;
}

/** Weekly throughput, plus the measure that carries its provenance. */
export interface ThroughputResult {
  readonly weeks: readonly ThroughputWeek[];
  readonly completed: Measure;
  readonly workMix: ReadonlyMap<string, readonly string[]>;
}

/**
 * Items completed per ISO week.
 *
 * Counts DISTINCT ISSUES. An issue held by four people contributes one, which is
 * the first of the two rules that make per-person figures add up.
 */
export function computeThroughput(factSet: FlowFactSet, issueSet: IssueSet): ThroughputResult {
  const keysByWeek = new Map<string, string[]>();
  const completedKeys: string[] = [];
  const workMix = new Map<string, string[]>();

  for (const fact of factSet.facts) {
    if (fact.completedMs === null) continue;
    completedKeys.push(fact.issue.key);

    const isoWeek = toIsoWeek(fact.completedMs);
    const weekKeys = keysByWeek.get(isoWeek) ?? [];
    weekKeys.push(fact.issue.key);
    keysByWeek.set(isoWeek, weekKeys);

    const typeKeys = workMix.get(fact.issue.issueTypeName) ?? [];
    typeKeys.push(fact.issue.key);
    workMix.set(fact.issue.issueTypeName, typeKeys);
  }

  const orderedWeeks = [...keysByWeek.keys()].sort();
  const weeks = orderedWeeks.map((isoWeek, index): ThroughputWeek => {
    const window = orderedWeeks
      .slice(Math.max(0, index - (ROLLING_MEAN_WEEKS - 1)), index + 1)
      .map((weekKey) => keysByWeek.get(weekKey)?.length ?? 0);
    const rollingMean = window.reduce((sum, count) => sum + count, 0) / window.length;
    return { isoWeek, completedKeys: keysByWeek.get(isoWeek) ?? [], rollingMean };
  });

  return {
    weeks,
    completed: measureKeys(
      "throughput",
      completedKeys,
      factSet.facts.map((fact) => fact.issue.key),
      issueSet,
      factSet,
    ),
    workMix,
  };
}

/** One completed item's duration, for the scatter. */
export interface CycleTimePoint {
  readonly issueKey: string;
  readonly completedMs: number;
  readonly cycleTimeDays: number;
}

/** The distribution, its percentiles, and the measure carrying provenance. */
export interface CycleTimeResult {
  readonly points: readonly CycleTimePoint[];
  readonly percentiles: ReadonlyMap<number, number>;
  readonly measured: Measure;
  /** Completed items whose start could not be established, named rather than assumed. */
  readonly withoutStartKeys: readonly string[];
}

/** The value at a percentile of a sorted list. */
function readPercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = (percentile / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sortedValues[lowerIndex] ?? 0;
  const upper = sortedValues[upperIndex] ?? lower;
  return lower + (upper - lower) * (rank - lowerIndex);
}

/**
 * How long completed items took.
 *
 * An item completed without ever having started is reported separately rather
 * than recorded as zero days — a zero would drag every percentile down and make
 * the team look faster than it is.
 */
export function computeCycleTime(factSet: FlowFactSet, issueSet: IssueSet): CycleTimeResult {
  const points: CycleTimePoint[] = [];
  const withoutStartKeys: string[] = [];

  for (const fact of factSet.facts) {
    if (fact.completedMs === null) continue;
    if (fact.cycleTimeDays === null) {
      withoutStartKeys.push(fact.issue.key);
      continue;
    }
    points.push({
      issueKey: fact.issue.key,
      completedMs: fact.completedMs,
      cycleTimeDays: fact.cycleTimeDays,
    });
  }

  const sorted = points.map((point) => point.cycleTimeDays).sort((first, second) => first - second);
  const percentiles = new Map(
    REPORTED_PERCENTILES.map((percentile) => [percentile, readPercentile(sorted, percentile)]),
  );

  return {
    points,
    percentiles,
    measured: measureKeys(
      "cycle-time",
      points.map((point) => point.issueKey),
      factSet.facts.map((fact) => fact.issue.key),
      issueSet,
      factSet,
    ),
    withoutStartKeys,
  };
}

/** One currently-unfinished item and how long it has been going. */
export interface AgingItem {
  readonly issueKey: string;
  readonly statusName: string;
  readonly ageDays: number;
  /** True when it is already older than the 85th percentile of finished work. */
  readonly isOlderThanUsual: boolean;
}

/** Unfinished work, plotted against what finished work usually takes. */
export interface AgingResult {
  readonly items: readonly AgingItem[];
  readonly measured: Measure;
  readonly eightyFifthPercentileDays: number;
}

/** Items in progress now, and which are older than usual. */
export function computeAgingWork(
  factSet: FlowFactSet,
  issueSet: IssueSet,
  cycleTime: CycleTimeResult,
  nowMs: number,
): AgingResult {
  const threshold = cycleTime.percentiles.get(85) ?? 0;
  const items: AgingItem[] = [];

  for (const fact of factSet.facts) {
    if (fact.completedMs !== null || fact.startedMs === null) continue;
    const ageDays = businessDaysBetween(fact.startedMs, nowMs, factSet.calendar);
    items.push({
      issueKey: fact.issue.key,
      statusName: fact.issue.statusName,
      ageDays,
      isOlderThanUsual: threshold > 0 && ageDays > threshold,
    });
  }

  items.sort((first, second) => second.ageDays - first.ageDays);

  return {
    items,
    measured: measureKeys(
      "aging-work",
      items.filter((item) => item.isOlderThanUsual).map((item) => item.issueKey),
      items.map((item) => item.issueKey),
      issueSet,
      factSet,
    ),
    eightyFifthPercentileDays: threshold,
  };
}

/** One day's occupancy of each status, for the accumulation chart. */
export interface CumulativeFlowDay {
  readonly isoDate: string;
  readonly countByStatus: ReadonlyMap<string, number>;
}

/** Every person's share, computed so the columns add up. */
export function computeHolderTotals(
  factSet: FlowFactSet,
  boundsMs: { readonly fromMs: number; readonly toMs: number },
): readonly HolderTotal[] {
  const creditsByIssue = factSet.facts.map((fact) =>
    allocateHolderCredit(fact.timeline, boundsMs, factSet.calendar),
  );
  return summariseHolderTotals(creditsByIssue);
}

export { ROLLING_MEAN_WEEKS };
