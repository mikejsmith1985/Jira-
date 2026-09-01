// buildChangeSet.ts — Deciding what will change, before anything does.
//
// Pure. Given the same proposals and the same issues it returns the same plan,
// so the whole thing is testable with no Jira and no mocking of one.
//
// Two rules do the heavy lifting. A proposal whose value already matches
// produces no change, so nobody is asked to approve a write that does nothing.
// And ONE blocker refuses the WHOLE action — not "apply the valid ones and
// warn", because a partially applied set is unreviewable: the user cannot tell
// what happened without going and looking, and going and looking is the thing
// this tool exists to replace.

import type { ConceptId } from "../fields/conceptId.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";
import type { FieldMap } from "../workspace/workspaceConfig.js";

/** How a field must be written. Jira is not uniform about this. */
export type WriteRoute =
  | "simple"
  | "option"
  | "user"
  | "fixVersion"
  | "storyPoints"
  | "issueLink"
  | "transition";

/** A suggested change to one field of one issue. */
export interface Proposal {
  readonly issueKey: string;
  /** Either a concept the map resolves, or a field Jira always provides. */
  readonly target: { readonly kind: "concept"; readonly conceptId: ConceptId } | { readonly kind: "field"; readonly fieldId: string };
  readonly proposedValue: unknown;
  readonly writeRoute: WriteRoute;
  /** Shown to the user. Never written to Jira. */
  readonly rationale?: string;
  readonly source: "pack" | "deterministic-fix";
}

/** One change that will actually be sent. */
export interface PlannedChange {
  readonly issueKey: string;
  readonly fieldId: string;
  /** Jira's own label for the field, so the diff reads as the user sees Jira. */
  readonly fieldLabel: string;
  readonly currentValue: unknown;
  readonly proposedValue: unknown;
  readonly writeRoute: WriteRoute;
  readonly rationale?: string;
}

/** Why the whole action is refused. */
export interface ChangeBlocker {
  readonly issueKey: string;
  readonly reason: string;
}

/** The reviewed plan. */
export interface ChangeSet {
  readonly plannedChanges: readonly PlannedChange[];
  readonly blockers: readonly ChangeBlocker[];
  /** Proposals dropped because the value was already correct — shown, not hidden. */
  readonly unchangedCount: number;
}

/** Compares two values after normalising the shapes Jira uses inconsistently. */
function isSameValue(currentValue: unknown, proposedValue: unknown): boolean {
  if (currentValue === proposedValue) return true;
  if (currentValue === null || currentValue === undefined) {
    return proposedValue === null || proposedValue === undefined || proposedValue === "";
  }

  // Rich text differing only in whitespace is not an edit. Treating it as one
  // would fill a diff with writes that change nothing a reader can see.
  if (typeof currentValue === "string" && typeof proposedValue === "string") {
    return currentValue.trim() === proposedValue.trim();
  }

  if (typeof currentValue === "object" && currentValue !== null) {
    const record = currentValue as Record<string, unknown>;
    const readable = record.value ?? record.name ?? record.id;
    if (readable !== undefined) return String(readable) === String(proposedValue);
  }

  return String(currentValue) === String(proposedValue);
}

/** Resolves a proposal's target to a real Jira field id, or explains why it cannot. */
function resolveTargetField(
  proposal: Proposal,
  fieldMap: FieldMap,
): { fieldId: string; fieldLabel: string } | { reason: string } {
  if (proposal.target.kind === "field") {
    return { fieldId: proposal.target.fieldId, fieldLabel: proposal.target.fieldId };
  }

  const entry = fieldMap[proposal.target.conceptId];
  if (entry.state !== "resolved") {
    return {
      reason:
        `No Jira field is confirmed for ${proposal.target.conceptId}, so this change has nowhere ` +
        `to go. Confirm it in setup first.`,
    };
  }

  return { fieldId: entry.fieldId, fieldLabel: entry.jiraName };
}

/**
 * Turns accepted proposals into a reviewable plan.
 *
 * Nothing here reaches Jira. The plan is shown as a diff, and only then applied.
 */
export function buildChangeSet(input: {
  readonly proposals: readonly Proposal[];
  readonly issueSet: IssueSet;
  readonly fieldMap: FieldMap;
}): ChangeSet {
  const plannedChanges: PlannedChange[] = [];
  const blockers: ChangeBlocker[] = [];
  let unchangedCount = 0;

  for (const proposal of input.proposals) {
    const issue: DetailedIssue | undefined = input.issueSet.byKey.get(proposal.issueKey);

    if (issue === undefined) {
      blockers.push({
        issueKey: proposal.issueKey,
        reason:
          `${proposal.issueKey} was not in the retrieval this suggestion came from, so its ` +
          `current value is unknown. Nothing may be written to an issue nobody fetched.`,
      });
      continue;
    }

    const resolved = resolveTargetField(proposal, input.fieldMap);
    if ("reason" in resolved) {
      blockers.push({ issueKey: proposal.issueKey, reason: resolved.reason });
      continue;
    }

    const currentValue = issue.fields.get(resolved.fieldId) ?? null;

    if (isSameValue(currentValue, proposal.proposedValue)) {
      unchangedCount += 1;
      continue;
    }

    plannedChanges.push({
      issueKey: proposal.issueKey,
      fieldId: resolved.fieldId,
      fieldLabel: issue.fieldNames.get(resolved.fieldId) ?? resolved.fieldLabel,
      currentValue,
      proposedValue: proposal.proposedValue,
      writeRoute: proposal.writeRoute,
      ...(proposal.rationale === undefined ? {} : { rationale: proposal.rationale }),
    });
  }

  return { plannedChanges, blockers, unchangedCount };
}

/**
 * May this plan be applied?
 *
 * One blocker refuses everything. A half-applied set leaves the user unable to
 * say what happened, which is worse than nothing happening.
 */
export function canApplyChangeSet(changeSet: ChangeSet): boolean {
  return changeSet.blockers.length === 0 && changeSet.plannedChanges.length > 0;
}
