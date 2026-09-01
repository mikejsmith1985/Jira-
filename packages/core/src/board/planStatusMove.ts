// planStatusMove.ts — Deciding what a drag needs, before anything is sent.
//
// A move Jira will refuse is refused HERE, with no request made and the card
// left where it was. Discovering an impossible move by sending it and watching
// the card jump back is a worse experience than being told, and it leaves a
// failed write in the log for something the user could not have done.
//
// The hard case is the two-part move: a status transition plus a sub-status
// field write, where the field is not on the transition screen. If the
// transition succeeds and the field write fails, the card MUST NOT snap back.
// Jira really did change. Reverting the card would show a state Jira does not
// hold, which is a lie told to make the interface look tidy.

import type { JiraAdapter, TransitionDescriptor } from "../jira/jiraAdapter.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { FieldMap } from "../workspace/workspaceConfig.js";
import type { ConceptId } from "../fields/conceptId.js";

/** What a drag turns out to require. */
export type MovePlan =
  | { readonly kind: "no-op"; readonly reason: string }
  | { readonly kind: "field-only"; readonly fieldId: string; readonly value: string }
  | { readonly kind: "transition-only"; readonly transition: TransitionDescriptor }
  | {
      readonly kind: "transition-with-field";
      readonly transition: TransitionDescriptor;
      readonly fieldId: string;
      readonly value: string;
      /** True when the field is on the transition screen, so both go in one request. */
      readonly isFieldOnTransitionScreen: boolean;
    }
  | { readonly kind: "needs-fields"; readonly transition: TransitionDescriptor; readonly requiredFieldIds: readonly string[] }
  | { readonly kind: "refused"; readonly reason: string };

/** Where a card is being dropped. */
export interface MoveTarget {
  readonly columnName: string;
  /** The status the target column maps to, when it maps to exactly one. */
  readonly targetStatusId: string | null;
  readonly targetStatusName: string | null;
  /** The band's value, when the drop is into a refined column. */
  readonly bandConcept: ConceptId | null;
  readonly bandValue: string | null;
}

/**
 * Works out what moving this card would require.
 *
 * Asks Jira which transitions it will actually accept, rather than assuming any
 * status can follow any other. A workflow that forbids a jump is a decision
 * somebody made, and this tool respects it rather than discovering it by
 * failure.
 */
export async function planStatusMove(input: {
  readonly issue: DetailedIssue;
  readonly target: MoveTarget;
  readonly fieldMap: FieldMap;
  readonly adapter: JiraAdapter;
}): Promise<MovePlan> {
  const { issue, target, fieldMap } = input;

  const bandFieldId =
    target.bandConcept === null || fieldMap[target.bandConcept].state !== "resolved"
      ? null
      : (fieldMap[target.bandConcept] as { fieldId: string }).fieldId;

  // A column mapping to several statuses offers no single target, and that is a
  // REFUSAL rather than a no-op. Conflating "no target status was given" with
  // "the card is already in the target status" would silently swallow a drop the
  // user meant, which is the worst of both: nothing happens and nothing is said.
  const isColumnAmbiguous = target.targetStatusId === null;
  if (isColumnAmbiguous && target.bandValue === null) {
    return {
      kind: "refused",
      reason:
        `The "${target.columnName}" column maps to more than one status, so there is no single ` +
        `status to move this to. Move it in Jira, where the choice is yours.`,
    };
  }

  const isAlreadyInStatus = isColumnAmbiguous || issue.statusId === target.targetStatusId;

  const currentBandValue =
    bandFieldId === null ? null : String(issue.fields.get(bandFieldId) ?? "");
  const isAlreadyInBand =
    target.bandValue === null || currentBandValue?.trim() === target.bandValue.trim();

  // Nothing to do. Sending a request that changes nothing puts a write in the
  // log for something that did not happen.
  if (isAlreadyInStatus && isAlreadyInBand) {
    return { kind: "no-op", reason: "This card is already in that column and band." };
  }

  // The band changed but the status did not: a field write, no transition.
  if (isAlreadyInStatus && bandFieldId !== null && target.bandValue !== null) {
    return { kind: "field-only", fieldId: bandFieldId, value: target.bandValue };
  }

  if (target.targetStatusId === null) {
    return {
      kind: "refused",
      reason:
        `The "${target.columnName}" column maps to more than one status, so there is no single ` +
        `status to move this to. Move it in Jira, where the choice is yours.`,
    };
  }

  const transitionsResponse = await input.adapter.fetchTransitions(issue.key);
  if (transitionsResponse.statusCode !== 200 || transitionsResponse.body === null) {
    return {
      kind: "refused",
      reason:
        transitionsResponse.jiraMessages[0] ??
        `Jira would not say which transitions ${issue.key} allows, so nothing was attempted.`,
    };
  }

  const transition = transitionsResponse.body.find(
    (candidate) =>
      candidate.toStatusName.trim().toLowerCase() ===
      (target.targetStatusName ?? "").trim().toLowerCase(),
  );

  // Refused, not attempted. The workflow forbids this move, and finding that out
  // by watching a card jump back is a worse way to learn it.
  if (transition === undefined) {
    return {
      kind: "refused",
      reason:
        `Jira offers no transition from "${issue.statusName}" to ` +
        `"${target.targetStatusName}" for ${issue.key}. Nothing was sent, and the card has not ` +
        `moved.`,
    };
  }

  if (transition.requiredFieldIds.length > 0 && bandFieldId === null) {
    return {
      kind: "needs-fields",
      transition,
      requiredFieldIds: transition.requiredFieldIds,
    };
  }

  if (bandFieldId === null || target.bandValue === null) {
    return { kind: "transition-only", transition };
  }

  return {
    kind: "transition-with-field",
    transition,
    fieldId: bandFieldId,
    value: target.bandValue,
    isFieldOnTransitionScreen: transition.requiredFieldIds.includes(bandFieldId),
  };
}

/** What actually happened to a move. */
export type MoveOutcome =
  | { readonly kind: "nothing-to-do" }
  | { readonly kind: "applied" }
  | { readonly kind: "refused"; readonly reason: string }
  | {
      readonly kind: "partially-applied";
      readonly whatSucceeded: string;
      readonly whatFailed: string;
      /** Always false. Jira changed, so the card must show what Jira now holds. */
      readonly shouldRevertCard: false;
    }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * Carries out a plan.
 *
 * The partial-success case is the one that matters. When a transition succeeds
 * and the field write that should have followed it fails, the card stays where
 * it was moved to: Jira performed the transition, so the card's new position is
 * the truth. Reverting it would show a state Jira does not hold, which is worse
 * than an honest partial failure.
 */
export async function executeStatusMove(
  plan: MovePlan,
  issueKey: string,
  adapter: JiraAdapter,
  writeField: (issueKey: string, fieldId: string, value: string) => Promise<boolean>,
  applyTransition: (issueKey: string, transitionId: string, fields?: Record<string, unknown>) => Promise<boolean>,
): Promise<MoveOutcome> {
  switch (plan.kind) {
    case "no-op":
      return { kind: "nothing-to-do" };

    case "refused":
      return { kind: "refused", reason: plan.reason };

    case "needs-fields":
      return {
        kind: "refused",
        reason:
          `Moving ${issueKey} needs ${plan.requiredFieldIds.join(", ")} filled in first. ` +
          `Nothing was sent.`,
      };

    case "field-only": {
      const wasWritten = await writeField(issueKey, plan.fieldId, plan.value);
      return wasWritten
        ? { kind: "applied" }
        : { kind: "failed", reason: `${issueKey}'s field could not be set. Nothing changed.` };
    }

    case "transition-only": {
      const wasMoved = await applyTransition(issueKey, plan.transition.transitionId);
      return wasMoved
        ? { kind: "applied" }
        : { kind: "failed", reason: `Jira refused the transition for ${issueKey}.` };
    }

    case "transition-with-field": {
      // One request when the field is on the transition screen: atomic, so there
      // is no partial state to report.
      if (plan.isFieldOnTransitionScreen) {
        const wasMoved = await applyTransition(issueKey, plan.transition.transitionId, {
          [plan.fieldId]: plan.value,
        });
        return wasMoved
          ? { kind: "applied" }
          : { kind: "failed", reason: `Jira refused the transition for ${issueKey}.` };
      }

      // Two requests. The order matters: transition first, because a field set
      // on an issue that then fails to move is the more confusing half-state.
      const wasMoved = await applyTransition(issueKey, plan.transition.transitionId);
      if (!wasMoved) {
        return { kind: "failed", reason: `Jira refused the transition for ${issueKey}.` };
      }

      const wasWritten = await writeField(issueKey, plan.fieldId, plan.value);
      if (wasWritten) return { kind: "applied" };

      return {
        kind: "partially-applied",
        whatSucceeded: `${issueKey} moved to ${plan.transition.toStatusName}.`,
        whatFailed:
          `Its ${plan.fieldId} could not be set to "${plan.value}", so the card is in the right ` +
          `column but not the right band.`,
        // Never revert. Jira performed the transition; showing the card back at
        // its origin would display a state Jira does not hold.
        shouldRevertCard: false,
      };
    }
  }
}

export { type TransitionDescriptor };
