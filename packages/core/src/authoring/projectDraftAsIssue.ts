// projectDraftAsIssue.ts — Letting the shipped checks read a draft.
//
// The checks consume a `DetailedIssue`, and a draft is not one. The alternative
// to this projection is a second implementation of every check that runs against
// drafts, and that is precisely how the predecessor acquired five live
// divergences between its two rule engines — a check that flagged an issue on
// one screen and passed it on another, with no way to tell which was right.
//
// One rule carries the whole file. A field the draft has not filled projects as
// ABSENT, not as empty. A check asking "is acceptance criteria blank?" must see
// the same thing it would see on a real issue that never had one; an empty
// string where Jira would have had nothing is a different answer to the same
// question.
//
// When enriching, the projection starts from the loaded issue, so a check sees
// the whole issue rather than only the parts somebody has touched. A draft that
// changed the summary must not make every other check report on a blank.
//
// Nothing here is ever sent to Jira. This exists to be read.

import type { DetailedIssue } from "../model/detailedIssue.js";

import { isEnrichingExistingIssue } from "./draft.js";
import type { AuthoringDraft } from "./draft.js";

/** The key a draft that does not exist yet answers to. */
export const DRAFT_ISSUE_KEY = "(draft)";

/** Jira's own ids for the fields every issue has. */
const SUMMARY_FIELD_ID = "summary";
const DESCRIPTION_FIELD_ID = "description";

/**
 * Is this value worth projecting?
 *
 * Empty text is treated as absent, because that is what a check would see on a
 * real issue whose field was never filled in.
 */
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Projects a draft into the shape the shipped checks read.
 *
 * @param acceptanceCriteriaFieldId This instance's criteria field, when it has one.
 */
export function projectDraftAsIssue(input: {
  readonly draft: AuthoringDraft;
  readonly acceptanceCriteriaFieldId: string | null;
  readonly issueTypeName: string;
  readonly nowIso: string;
}): DetailedIssue {
  const { draft } = input;
  const isEnriching = isEnrichingExistingIssue(draft);

  // When enriching, start from what the issue actually holds, so a check sees
  // the whole issue rather than only the parts somebody edited.
  const fields = new Map<string, unknown>();
  if (isEnriching && draft.loadedFieldValues !== null) {
    for (const [fieldId, value] of Object.entries(draft.loadedFieldValues)) {
      if (isPresent(value)) fields.set(fieldId, value);
    }
  }

  /** Sets a field, or removes it, so unfilled reads as absent rather than empty. */
  const put = (fieldId: string | null, value: unknown): void => {
    if (fieldId === null) return;
    if (isPresent(value)) fields.set(fieldId, value);
    else fields.delete(fieldId);
  };

  put(SUMMARY_FIELD_ID, draft.summary);
  put(DESCRIPTION_FIELD_ID, draft.description);
  put(input.acceptanceCriteriaFieldId, draft.acceptanceCriteria);
  for (const [fieldId, value] of Object.entries(draft.fieldValues)) put(fieldId, value);

  return {
    key: isEnriching ? (draft.existingIssueKey ?? DRAFT_ISSUE_KEY) : DRAFT_ISSUE_KEY,
    id: DRAFT_ISSUE_KEY,
    issueTypeName: input.issueTypeName,
    // A draft has not been through any workflow, so it is at the beginning of
    // one. Claiming otherwise would let a check about stalled work fire on
    // something nobody has raised yet.
    statusName: "Draft",
    statusId: "",
    statusCategoryKey: "new",
    projectKey: draft.projectKey,
    createdIso: input.nowIso,
    resolutionDateIso: null,
    assigneeAccountId: null,
    fields,
    fieldNames: new Map(),
    // Null means the history is unknown, which is true: a draft has none. An
    // empty array would claim it has a history and that nothing happened in it.
    changelog: null,
  };
}
