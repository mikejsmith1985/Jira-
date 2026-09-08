// projectDraftAsIssue.test.ts — Unfilled is absent, not empty.
//
// The shipped checks consume a `DetailedIssue`; a draft is not one. This
// projection exists so they can read a draft unchanged, because the alternative
// — a second implementation of every check for drafts — is exactly how the
// predecessor acquired five live divergences between two rule engines, where a
// check flagged an issue on one screen and passed it on another.
//
// The rule that carries the file: a field the draft has not filled projects as
// ABSENT. A check asking "is this blank?" must see what it would see on a real
// issue that never had the field, and an empty string is a different answer to
// the same question.

import { describe, expect, it } from "vitest";

import { buildEmptyDraft } from "../src/authoring/draft.js";
import type { AuthoringDraft } from "../src/authoring/draft.js";
import {
  DRAFT_ISSUE_KEY,
  projectDraftAsIssue,
} from "../src/authoring/projectDraftAsIssue.js";

const NOW = "2026-09-08T09:14:00.000Z";

/** Projects a draft with the standard field ids. */
function project(draft: AuthoringDraft) {
  return projectDraftAsIssue({
    draft,
    acceptanceCriteriaFieldId: "customfield_ac",
    issueTypeName: "Story",
    nowIso: NOW,
  });
}

describe("a draft that does not exist yet", () => {
  it("answers to a key that plainly is not a Jira key", () => {
    // A placeholder that looked like a key would be worse than one that does
    // not: somebody would go looking for it.
    expect(project(buildEmptyDraft(NOW)).key).toBe(DRAFT_ISSUE_KEY);
  });

  it("is at the beginning of a workflow, because it has not been through one", () => {
    // Claiming otherwise would let a check about stalled work fire on something
    // nobody has even raised.
    expect(project(buildEmptyDraft(NOW)).statusCategoryKey).toBe("new");
  });

  it("has an unknown history rather than an empty one", () => {
    // null means "we do not know"; an empty array would claim it has a history
    // in which nothing happened.
    expect(project(buildEmptyDraft(NOW)).changelog).toBeNull();
  });
});

describe("a field the draft has not filled", () => {
  it("is absent, not empty", () => {
    const issue = project(buildEmptyDraft(NOW));

    expect(issue.fields.has("summary")).toBe(false);
    expect(issue.fields.has("customfield_ac")).toBe(false);
  });

  it("is absent even when the draft holds whitespace", () => {
    const issue = project({ ...buildEmptyDraft(NOW), summary: "   " });

    expect(issue.fields.has("summary")).toBe(false);
  });

  it("is present once it holds something", () => {
    const issue = project({ ...buildEmptyDraft(NOW), summary: "Show enrolment status" });

    expect(issue.fields.get("summary")).toBe("Show enrolment status");
  });
});

describe("a draft enriching an existing issue", () => {
  /** A draft loaded from an issue that already held two fields. */
  const LOADED: AuthoringDraft = {
    ...buildEmptyDraft(NOW),
    existingIssueKey: "ENCUC-1142",
    summary: "Show enrolment status",
    loadedFieldValues: {
      summary: "Show enrolment status",
      customfield_ac: "Given a plan change…",
      customfield_10500: { value: "Run" },
    },
  };

  it("keeps the issue's own key, so a check reports on the real thing", () => {
    expect(project(LOADED).key).toBe("ENCUC-1142");
  });

  it("starts from the whole issue, not only the parts somebody touched", () => {
    // Otherwise changing a summary makes every other check report on a blank.
    const issue = project(LOADED);

    expect(issue.fields.get("customfield_10500")).toEqual({ value: "Run" });
  });

  it("lets the draft override what the issue held", () => {
    const issue = project({ ...LOADED, summary: "Show it after a plan change" });

    expect(issue.fields.get("summary")).toBe("Show it after a plan change");
  });

  it("treats a field the operator cleared as absent, matching what a save would do", () => {
    const issue = project({ ...LOADED, acceptanceCriteria: "" });

    // The draft's own empty criteria wins over the loaded value, because that is
    // what the operator is proposing.
    expect(issue.fields.has("customfield_ac")).toBe(false);
  });
});

describe("what it never does", () => {
  it("carries no field names, because a draft has no Jira labels of its own", () => {
    expect(project(buildEmptyDraft(NOW)).fieldNames.size).toBe(0);
  });

  it("omits acceptance criteria entirely when the instance has no field for it", () => {
    const issue = projectDraftAsIssue({
      draft: { ...buildEmptyDraft(NOW), acceptanceCriteria: "Given a plan change…" },
      acceptanceCriteriaFieldId: null,
      issueTypeName: "Story",
      nowIso: NOW,
    });

    expect([...issue.fields.keys()]).toHaveLength(0);
  });
});
