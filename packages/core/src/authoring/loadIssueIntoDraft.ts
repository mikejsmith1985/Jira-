// loadIssueIntoDraft.ts — Bringing an existing issue in to be improved.
//
// This is the moment the second failure with no symptom is created or avoided.
// `loadedFieldValues` is captured HERE, once, and never written again. Every
// later save compares against it, so a description the operator never touched
// produces no write.
//
// Comparing against anything else — the field's current shape, a normalised
// form, a default — silently rewrites text nobody edited, and nothing on screen
// would say so. The predecessor hit exactly this: headings in an untouched rich
// description came back as "1. 1." lists after a save.
//
// The other thing decided here is which create screen applies. When enriching,
// the project and issue type are the LOADED ISSUE'S OWN. The operator does not
// choose them and cannot change them: moving an issue between projects or types
// is not this feature, and leaving it unstated would let two implementations
// disagree about which fields exist.

import type { AuthoringDraft } from "./draft.js";

/** What a loaded issue tells us, before any of it becomes a draft. */
export interface LoadedIssue {
  readonly issueKey: string;
  readonly projectKey: string;
  readonly issueTypeId: string;
  /** Every field value the issue currently holds, keyed by the instance's field id. */
  readonly fieldValues: Readonly<Record<string, unknown>>;
}

/** Why an issue could not be brought in. */
export type LoadFailure =
  | { readonly kind: "not-found"; readonly issueKey: string }
  | { readonly kind: "not-permitted"; readonly issueKey: string }
  | { readonly kind: "unreachable"; readonly reason: string };

/** The outcome of trying to load one. */
export type LoadResult =
  | { readonly status: "loaded"; readonly issue: LoadedIssue }
  | { readonly status: "failed"; readonly failure: LoadFailure };

/** HTTP statuses Jira uses to mean the issue is not yours to see. */
const NOT_FOUND = 404;
const NOT_PERMITTED = 403;

/**
 * Reads Jira's answer about one issue.
 *
 * A key that does not exist and a key you cannot see are separated because they
 * ask different things of the reader: one is a typo, the other is a permission
 * to request. Jira answers 404 for both in some configurations, which is why the
 * message below never claims more than it knows.
 */
export function readLoadResult(input: {
  readonly issueKey: string;
  readonly statusCode: number;
  readonly rawIssue: Record<string, unknown> | null;
  readonly jiraMessages: readonly string[];
}): LoadResult {
  if (input.statusCode === NOT_FOUND) {
    return { status: "failed", failure: { kind: "not-found", issueKey: input.issueKey } };
  }
  if (input.statusCode === NOT_PERMITTED) {
    return { status: "failed", failure: { kind: "not-permitted", issueKey: input.issueKey } };
  }
  if (input.rawIssue === null) {
    return {
      status: "failed",
      failure: {
        kind: "unreachable",
        reason: input.jiraMessages[0] ?? `Jira answered with status ${input.statusCode}.`,
      },
    };
  }

  const fields = (input.rawIssue.fields ?? {}) as Record<string, unknown>;
  const project = (fields.project ?? {}) as Record<string, unknown>;
  const issueType = (fields.issuetype ?? {}) as Record<string, unknown>;

  return {
    status: "loaded",
    issue: {
      issueKey: typeof input.rawIssue.key === "string" ? input.rawIssue.key : input.issueKey,
      projectKey: typeof project.key === "string" ? project.key : "",
      issueTypeId: typeof issueType.id === "string" ? issueType.id : "",
      fieldValues: fields,
    },
  };
}

/** What to tell somebody when an issue could not be brought in. */
export function describeLoadFailure(failure: LoadFailure): string {
  switch (failure.kind) {
    case "not-found":
      return (
        `Jira has no issue ${failure.issueKey}, or your account cannot see it. ` +
        `Check the key. Nothing has changed, and Jira+ is still set to create a new issue.`
      );
    case "not-permitted":
      return (
        `Your account cannot open ${failure.issueKey}. ` +
        `Nothing has changed, and Jira+ is still set to create a new issue.`
      );
    case "unreachable":
      return `Jira+ could not reach Jira to read that issue: ${failure.reason}`;
  }
}

/**
 * Fills a draft from an issue.
 *
 * @param summaryFieldId Jira's own id for the summary field.
 * @param descriptionFieldId Jira's own id for the description field.
 * @param acceptanceCriteriaFieldId This instance's criteria field, when it has one.
 */
export function loadIssueIntoDraft(input: {
  readonly draft: AuthoringDraft;
  readonly issue: LoadedIssue;
  readonly summaryFieldId: string;
  readonly descriptionFieldId: string;
  readonly acceptanceCriteriaFieldId: string | null;
  readonly nowIso: string;
}): AuthoringDraft {
  const { issue } = input;

  /** Reads a field as text, since a draft box holds text. */
  const readText = (fieldId: string | null): string => {
    if (fieldId === null) return "";
    const value = issue.fieldValues[fieldId];
    return typeof value === "string" ? value : "";
  };

  return {
    ...input.draft,
    existingIssueKey: issue.issueKey,
    summary: readText(input.summaryFieldId),
    description: readText(input.descriptionFieldId),
    acceptanceCriteria: readText(input.acceptanceCriteriaFieldId),
    // The issue's own, not the operator's choice. Moving an issue between
    // projects or types is not this feature.
    projectKey: issue.projectKey,
    issueTypeId: issue.issueTypeId,
    fieldValues: {},
    // Captured once. Every later save compares against this, which is what stops
    // a field nobody touched from being rewritten.
    loadedFieldValues: issue.fieldValues,
    updatedAtIso: input.nowIso,
  };
}
