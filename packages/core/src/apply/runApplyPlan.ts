// runApplyPlan.ts — Applying a reviewed plan, item by item.
//
// Each change succeeds or fails on its own. Five changes where the third fails
// leaves four applied and one failure carrying Jira's reason.
//
// Rollback is deliberately not attempted. Reverting a successful write to make a
// batch look atomic is a second change nobody asked for, and it lies about what
// Jira now holds. Reporting honestly what happened is more useful than
// pretending nothing did.

import type { JiraTransport } from "../jira/jiraAdapter.js";
import { resolveFieldWriteRoute } from "../jira/write/fieldWriters.js";
import type { ChangeSet, PlannedChange } from "./buildChangeSet.js";
import { canApplyChangeSet } from "./buildChangeSet.js";

/** What happened to one change. */
export interface ApplyResult {
  readonly issueKey: string;
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly status: "applied" | "failed";
  /** Jira's own words on failure, because they are more useful than ours. */
  readonly message?: string;
}

/** What happened to the whole plan. */
export interface ApplyOutcome {
  readonly results: readonly ApplyResult[];
  readonly appliedCount: number;
  readonly failedCount: number;
  /** Set when the plan was refused outright rather than attempted. */
  readonly refusedReason: string | null;
}

/** Successful HTTP status codes for a Jira write. */
const SUCCESS_STATUS_MINIMUM = 200;
const SUCCESS_STATUS_MAXIMUM = 300;

/** Applies one change. */
async function applyOne(
  change: PlannedChange,
  transport: JiraTransport,
): Promise<ApplyResult> {
  const writer = resolveFieldWriteRoute(change.writeRoute);

  try {
    const response = await writer(
      { issueKey: change.issueKey, fieldId: change.fieldId, value: change.proposedValue },
      transport,
    );

    const wasSuccessful =
      response.statusCode >= SUCCESS_STATUS_MINIMUM && response.statusCode < SUCCESS_STATUS_MAXIMUM;

    if (wasSuccessful) {
      return {
        issueKey: change.issueKey,
        fieldId: change.fieldId,
        fieldLabel: change.fieldLabel,
        status: "applied",
      };
    }

    return {
      issueKey: change.issueKey,
      fieldId: change.fieldId,
      fieldLabel: change.fieldLabel,
      status: "failed",
      message:
        response.jiraMessages[0] ??
        `Jira refused this change with status ${response.statusCode}.`,
    };
  } catch (error) {
    return {
      issueKey: change.issueKey,
      fieldId: change.fieldId,
      fieldLabel: change.fieldLabel,
      status: "failed",
      message: error instanceof Error ? error.message : "The request did not complete.",
    };
  }
}

/**
 * Applies a reviewed plan.
 *
 * Refuses outright when the plan carries a blocker, rather than applying the
 * parts that would have worked. Otherwise every change is attempted and every
 * outcome reported — including the failures, which is the point.
 */
export async function runApplyPlan(
  changeSet: ChangeSet,
  transport: JiraTransport,
): Promise<ApplyOutcome> {
  if (changeSet.blockers.length > 0) {
    return {
      results: [],
      appliedCount: 0,
      failedCount: 0,
      refusedReason:
        `This action was refused because ${changeSet.blockers.length} change` +
        `${changeSet.blockers.length === 1 ? "" : "s"} could not be made: ` +
        `${changeSet.blockers.map((blocker) => `${blocker.issueKey} — ${blocker.reason}`).join(" ")} ` +
        `Nothing was written, so nothing is half-done.`,
    };
  }

  if (!canApplyChangeSet(changeSet)) {
    return {
      results: [],
      appliedCount: 0,
      failedCount: 0,
      refusedReason: "There is nothing to apply: every proposed value already matches.",
    };
  }

  // Sequential rather than parallel. A rate limit hit halfway through a parallel
  // batch produces failures that say nothing about the change itself.
  const results: ApplyResult[] = [];
  for (const change of changeSet.plannedChanges) {
    results.push(await applyOne(change, transport));
  }

  return {
    results,
    appliedCount: results.filter((result) => result.status === "applied").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    refusedReason: null,
  };
}
