// attribution.ts — Who held the work, without counting it twice.
//
// The predecessor credited a full item, and its full story points, to EACH
// person who held it. An issue touched by four people added four to the team
// column. Per-person columns did not sum to the team total, and once somebody
// noticed, every number on the page became suspect — which is a fair reaction,
// because a total that does not add up is evidence that nobody checked.
//
// Two rules make that impossible here:
//
//   1. Team totals count distinct issues. An item contributes once, by
//      construction, however many people held it.
//   2. Per-person attribution divides one issue's ELAPSED TIME, not its points
//      and not its count. The shares sum to exactly one issue.
//
// Both are asserted, and the second is asserted at runtime in development too,
// because an arithmetic invariant nobody checks is an arithmetic invariant that
// eventually stops holding.

import type { WorkingCalendar } from "../workspace/workspaceConfig.js";
import { businessMillisBetween } from "./workingDays.js";
import { UNASSIGNED_HOLDER } from "./issueTimeline.js";
import type { IssueTimeline } from "./issueTimeline.js";

/** How much of one issue's working life a person held. */
export interface HolderCredit {
  readonly issueKey: string;
  readonly holderId: string;
  readonly activeMillis: number;
  /** This holder's fraction of the issue. Shares across an issue sum to 1. */
  readonly shareOfIssue: number;
}

/** Tolerance for the sums-to-one assertion, allowing for floating-point drift. */
const SHARE_TOLERANCE = 1e-9;

/**
 * Splits one issue among the people who held it, by working time.
 *
 * Time with no assignee is credited to an explicit unassigned holder rather than
 * to whoever picked the issue up next — charging a queue to the person who
 * ended it is how a tool comes to blame the wrong part of a process.
 */
export function allocateHolderCredit(
  timeline: IssueTimeline,
  boundsMs: { readonly fromMs: number; readonly toMs: number },
  calendar: WorkingCalendar,
): readonly HolderCredit[] {
  if (!timeline.isReconstructable) return [];

  const millisByHolder = new Map<string, number>();

  for (const segment of timeline.holderSegments) {
    const segmentStart = Math.max(segment.fromMs, boundsMs.fromMs);
    const segmentEnd = Math.min(segment.toMs ?? boundsMs.toMs, boundsMs.toMs);
    if (segmentEnd <= segmentStart) continue;

    const elapsed = businessMillisBetween(segmentStart, segmentEnd, calendar);
    const holderId = segment.value;
    millisByHolder.set(holderId, (millisByHolder.get(holderId) ?? 0) + elapsed);
  }

  const totalMillis = [...millisByHolder.values()].reduce((sum, value) => sum + value, 0);

  if (totalMillis === 0) {
    // Every moment fell outside working hours. The issue is still one issue, so
    // it is credited whole to whoever held it longest rather than vanishing.
    const holders = [...millisByHolder.keys()];
    const soleHolder = holders[0] ?? UNASSIGNED_HOLDER;
    return [{ issueKey: timeline.issueKey, holderId: soleHolder, activeMillis: 0, shareOfIssue: 1 }];
  }

  return [...millisByHolder.entries()].map(([holderId, activeMillis]) => ({
    issueKey: timeline.issueKey,
    holderId,
    activeMillis,
    shareOfIssue: activeMillis / totalMillis,
  }));
}

/**
 * Confirms an issue's shares sum to exactly one issue.
 *
 * Called by the aggregate builders in development. The check is cheap and the
 * defect it catches is the one that destroyed confidence in the predecessor.
 */
export function assertSharesSumToOne(credits: readonly HolderCredit[]): void {
  if (credits.length === 0) return;
  const total = credits.reduce((sum, credit) => sum + credit.shareOfIssue, 0);
  if (Math.abs(total - 1) > SHARE_TOLERANCE) {
    throw new Error(
      `Attribution for ${credits[0]?.issueKey} sums to ${total}, not 1. Per-person figures would ` +
        `not add up to the team total, which is the defect this rule exists to prevent.`,
    );
  }
}

/** One person's share of a set of issues. */
export interface HolderTotal {
  readonly holderId: string;
  /** Fractional: three issues each half-held is 1.5, not 3. */
  readonly creditedIssues: number;
  readonly activeMillis: number;
  /** Whole issues this person touched at all. Deliberately NOT additive. */
  readonly touchedIssueCount: number;
}

/**
 * Sums per-person credit across many issues.
 *
 * `creditedIssues` adds up to the team total exactly. `touchedIssueCount` does
 * not, and is labelled as such wherever it appears — both the honest number and
 * the intuitive one are available, and neither is mistaken for the other.
 */
export function summariseHolderTotals(
  creditsByIssue: readonly (readonly HolderCredit[])[],
): readonly HolderTotal[] {
  const credited = new Map<string, number>();
  const active = new Map<string, number>();
  const touched = new Map<string, Set<string>>();

  for (const credits of creditsByIssue) {
    assertSharesSumToOne(credits);
    for (const credit of credits) {
      credited.set(credit.holderId, (credited.get(credit.holderId) ?? 0) + credit.shareOfIssue);
      active.set(credit.holderId, (active.get(credit.holderId) ?? 0) + credit.activeMillis);
      const keys = touched.get(credit.holderId) ?? new Set<string>();
      keys.add(credit.issueKey);
      touched.set(credit.holderId, keys);
    }
  }

  return [...credited.entries()]
    .map(([holderId, creditedIssues]) => ({
      holderId,
      creditedIssues,
      activeMillis: active.get(holderId) ?? 0,
      touchedIssueCount: touched.get(holderId)?.size ?? 0,
    }))
    .sort((first, second) => second.creditedIssues - first.creditedIssues);
}

export { SHARE_TOLERANCE };
