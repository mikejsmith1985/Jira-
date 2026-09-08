// buildAuthoringChangeSet.ts — What will actually be written, and why it cannot
// be a duplicate.
//
// One guarantee runs through this file: a draft carrying an `existingIssueKey`
// can never produce a create. That is not a check somebody could forget to
// call — the create branch is unreachable while the key is set, so no sequence
// of actions on the screen can produce a second issue.
//
// The second guarantee is quieter and its failure has no symptom at all. On the
// update path a field is written only when its value differs from what the issue
// held WHEN IT WAS LOADED. Comparing against anything else — a normalised
// description, a default, the field's current shape — silently rewrites text
// nobody touched, and nothing on screen would say so.
//
// The result is the shipped `ChangeSet`, so the existing was-to-will-be diff
// renders it unchanged and the existing blocker gate governs it.

import type { ChangeBlocker, ChangeSet, PlannedChange } from "../apply/buildChangeSet.js";

import { isEnrichingExistingIssue } from "./draft.js";
import type { AuthoringDraft } from "./draft.js";
import { findField, readRequiredFields } from "./createScreenShape.js";
import type { CreateScreenShape } from "./createScreenShape.js";

/**
 * What a planned create is addressed to before Jira has given it a key.
 *
 * Shown in the diff exactly as written, because a placeholder that looks like a
 * key would be worse than one that plainly is not.
 */
export const NEW_ISSUE_KEY = "(new issue)";

/** Compares two values the way Jira's own inconsistencies require. */
function isSameValue(current: unknown, proposed: unknown): boolean {
  if (current === proposed) return true;
  if (current === null || current === undefined) {
    return proposed === null || proposed === undefined || proposed === "";
  }
  if (typeof current === "string" && typeof proposed === "string") {
    return current === proposed;
  }
  // An option field comes back as an object and goes out as a string.
  if (typeof current === "object" && typeof proposed === "string") {
    const option = current as Record<string, unknown>;
    return option.value === proposed || option.name === proposed || option.key === proposed;
  }
  return false;
}

/** The five reasons a write cannot proceed. */
function findBlockers(input: {
  readonly draft: AuthoringDraft;
  readonly shape: CreateScreenShape;
  readonly values: Readonly<Record<string, unknown>>;
  readonly changeCount: number;
  readonly isEnriching: boolean;
}): readonly ChangeBlocker[] {
  const blockers: ChangeBlocker[] = [];
  const issueKey = input.isEnriching ? (input.draft.existingIssueKey ?? "") : NEW_ISSUE_KEY;

  if (input.draft.summary.trim().length === 0) {
    blockers.push({ issueKey, reason: "An issue needs a summary." });
  }

  if (!input.isEnriching) {
    if (input.draft.projectKey.trim().length === 0) {
      blockers.push({ issueKey, reason: "Choose the project this issue belongs in." });
    }
    if (input.draft.issueTypeId.trim().length === 0) {
      blockers.push({ issueKey, reason: "Choose an issue type." });
    }
  }

  if (input.shape.status === "unavailable") {
    blockers.push({
      issueKey,
      reason:
        `Jira+ could not read what this issue type requires: ${input.shape.reason} ` +
        `Nothing is written while that is unknown.`,
    });
  }

  for (const field of readRequiredFields(input.shape)) {
    const value = input.values[field.fieldId];
    const isEmpty =
      value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (isEmpty) {
      blockers.push({ issueKey, reason: `Jira requires ${field.name} for this issue type.` });
    }
  }

  if (input.changeCount === 0 && blockers.length === 0) {
    blockers.push({
      issueKey,
      reason: input.isEnriching
        ? "Nothing has changed, so there is nothing to save."
        : "There is nothing to create yet.",
    });
  }

  return blockers;
}

/** Turns one field value into a planned change. */
function planChange(input: {
  readonly issueKey: string;
  readonly fieldId: string;
  readonly shape: CreateScreenShape;
  readonly currentValue: unknown;
  readonly proposedValue: unknown;
}): PlannedChange {
  const field = findField(input.shape, input.fieldId);
  return {
    issueKey: input.issueKey,
    fieldId: input.fieldId,
    fieldLabel: field?.name ?? input.fieldId,
    currentValue: input.currentValue,
    proposedValue: input.proposedValue,
    // The instance already told us which fields take an option, so the route is
    // read from the create screen rather than guessed from the field id.
    writeRoute: field?.allowedValues === null || field === undefined ? "simple" : "option",
  };
}

/**
 * Builds the change set for a draft.
 *
 * @param values Every value the draft would write, keyed by the instance's own
 *               field id. The operator's narrative has no field id and therefore
 *               cannot appear here.
 */
export function buildAuthoringChangeSet(input: {
  readonly draft: AuthoringDraft;
  readonly shape: CreateScreenShape;
  readonly values: Readonly<Record<string, unknown>>;
}): ChangeSet {
  const isEnriching = isEnrichingExistingIssue(input.draft);
  const plannedChanges: PlannedChange[] = [];
  let unchangedCount = 0;

  if (isEnriching) {
    // The update path. There is no create branch here to reach, which is the
    // whole guarantee — not a condition that could be inverted by a later edit.
    const issueKey = input.draft.existingIssueKey ?? "";
    const loaded = input.draft.loadedFieldValues ?? {};

    for (const [fieldId, proposedValue] of Object.entries(input.values)) {
      const currentValue = loaded[fieldId] ?? null;
      if (isSameValue(currentValue, proposedValue)) {
        unchangedCount += 1;
        continue;
      }
      plannedChanges.push(planChange({ issueKey, fieldId, shape: input.shape, currentValue, proposedValue }));
    }
  } else {
    for (const [fieldId, proposedValue] of Object.entries(input.values)) {
      plannedChanges.push(
        planChange({
          issueKey: NEW_ISSUE_KEY,
          fieldId,
          shape: input.shape,
          currentValue: null,
          proposedValue,
        }),
      );
    }
  }

  return {
    plannedChanges,
    blockers: findBlockers({
      draft: input.draft,
      shape: input.shape,
      values: input.values,
      changeCount: plannedChanges.length,
      isEnriching,
    }),
    unchangedCount,
  };
}

/** Will applying this change set create an issue rather than update one? */
export function isCreatingNewIssue(changeSet: ChangeSet): boolean {
  return changeSet.plannedChanges.some((change) => change.issueKey === NEW_ISSUE_KEY);
}
