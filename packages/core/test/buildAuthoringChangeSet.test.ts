// buildAuthoringChangeSet.test.ts — Two failures that look like success.
//
// The first is a duplicate issue. Somebody loads a one-line stub to improve it,
// saves, and now there are two Features describing the same work — and nothing
// on screen said so. The guarantee against it is that a draft carrying an
// existing issue key has no create branch to reach, and the property test below
// asserts that over generated drafts rather than over one example, because one
// example proves only that one path was thought of.
//
// The second is a description silently rewritten. A save must compare against
// what the issue held WHEN IT WAS LOADED, not against a normalised or default
// form, or text nobody touched is overwritten with something that merely looks
// equivalent. Nothing reports that afterwards.

import { describe, expect, it } from "vitest";

import {
  NEW_ISSUE_KEY,
  buildAuthoringChangeSet,
  isCreatingNewIssue,
} from "../src/authoring/buildAuthoringChangeSet.js";
import { buildEmptyDraft } from "../src/authoring/draft.js";
import type { AuthoringDraft } from "../src/authoring/draft.js";
import {
  buildCreateScreenShape,
  describeUnavailableShape,
} from "../src/authoring/createScreenShape.js";
import type { CreateScreenShape } from "../src/authoring/createScreenShape.js";

const NOW = "2026-09-08T09:14:00.000Z";

/** A shape offering a summary, a description, and one required select. */
function buildShape(overrides: Record<string, unknown> = {}): CreateScreenShape {
  return buildCreateScreenShape({
    projectKey: "DENP",
    issueTypeId: "10001",
    rawFields: {
      summary: { name: "Summary", required: true },
      description: { name: "Description", required: false },
      customfield_10500: {
        name: "Initiative Type",
        required: false,
        allowedValues: [{ value: "Run" }, { value: "Grow" }],
      },
      ...overrides,
    },
  });
}

/** A draft ready to create, with everything a create needs. */
function buildCreatableDraft(overrides: Partial<AuthoringDraft> = {}): AuthoringDraft {
  return {
    ...buildEmptyDraft(NOW),
    summary: "Show enrolment status after a plan change",
    projectKey: "DENP",
    issueTypeId: "10001",
    ...overrides,
  };
}

describe("creating a new issue", () => {
  it("plans one change per value, addressed to no key yet", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft(),
      shape: buildShape(),
      values: { summary: "Show enrolment status", description: "Members cannot see it." },
    });

    expect(changeSet.plannedChanges).toHaveLength(2);
    expect(changeSet.plannedChanges.every((change) => change.issueKey === NEW_ISSUE_KEY)).toBe(true);
  });

  it("labels each change with the name the instance uses, not the field id", () => {
    // The diff has to read the way Jira reads, or somebody checking it against
    // Jira is comparing two different vocabularies.
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft(),
      shape: buildShape(),
      values: { customfield_10500: "Run", summary: "S" },
    });

    const labels = changeSet.plannedChanges.map((change) => change.fieldLabel);

    expect(labels).toContain("Initiative Type");
    expect(labels).not.toContain("customfield_10500");
  });
});

describe("enriching an existing issue", () => {
  /** A draft loaded from a stub whose summary and description are known. */
  function buildLoadedDraft(overrides: Partial<AuthoringDraft> = {}): AuthoringDraft {
    return {
      ...buildEmptyDraft(NOW),
      existingIssueKey: "ENCUC-1142",
      summary: "Show enrolment status",
      loadedFieldValues: { summary: "Show enrolment status", description: "A one-line stub." },
      ...overrides,
    };
  }

  it("NEVER yields a create, for any draft carrying a key", () => {
    // The guarantee this whole story rests on, asserted over generated drafts
    // rather than one example. A single example proves only that one path was
    // considered; this covers every combination of the fields somebody could
    // fill in before pressing save.
    const summaries = ["", "S", "a longer summary"];
    const projects = ["", "DENP", "ENCUC"];
    const types = ["", "10001", "10002"];
    const valueSets = [{}, { summary: "S" }, { summary: "S", description: "D" }];

    for (const summary of summaries) {
      for (const projectKey of projects) {
        for (const issueTypeId of types) {
          for (const values of valueSets) {
            const changeSet = buildAuthoringChangeSet({
              draft: buildLoadedDraft({ summary, projectKey, issueTypeId }),
              shape: buildShape(),
              values,
            });

            expect(isCreatingNewIssue(changeSet)).toBe(false);
          }
        }
      }
    }
  });

  it("writes only fields whose value genuinely differs from the loaded issue", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildLoadedDraft(),
      shape: buildShape(),
      values: { summary: "Show enrolment status", description: "Now written properly." },
    });

    expect(changeSet.plannedChanges.map((change) => change.fieldId)).toEqual(["description"]);
  });

  it("leaves a description the operator never edited alone", () => {
    // The failure with no symptom. Comparing against anything other than the
    // loaded value rewrites text nobody touched, and nothing reports it.
    const changeSet = buildAuthoringChangeSet({
      draft: buildLoadedDraft(),
      shape: buildShape(),
      values: { summary: "Show enrolment status", description: "A one-line stub." },
    });

    expect(changeSet.plannedChanges).toHaveLength(0);
    expect(changeSet.unchangedCount).toBe(2);
  });

  it("recognises an option field as unchanged when Jira returns it as an object", () => {
    // Jira hands an option back as { value: "Run" } and takes it as "Run".
    // Reading those as different would rewrite the field on every single save.
    const changeSet = buildAuthoringChangeSet({
      draft: buildLoadedDraft({
        loadedFieldValues: { summary: "S", customfield_10500: { value: "Run" } },
        summary: "S",
      }),
      shape: buildShape(),
      values: { summary: "S", customfield_10500: "Run" },
    });

    expect(changeSet.plannedChanges).toHaveLength(0);
  });

  it("blocks a save when nothing has changed, rather than doing nothing quietly", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildLoadedDraft(),
      shape: buildShape(),
      values: { summary: "Show enrolment status" },
    });

    expect(changeSet.blockers.map((blocker) => blocker.reason)).toContain(
      "Nothing has changed, so there is nothing to save.",
    );
  });
});

describe("the blockers", () => {
  it("refuses a draft with no summary", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft({ summary: "" }),
      shape: buildShape(),
      values: { description: "D" },
    });

    expect(changeSet.blockers.map((blocker) => blocker.reason)).toContain("An issue needs a summary.");
  });

  it("refuses a draft with no project or issue type", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft({ projectKey: "", issueTypeId: "" }),
      shape: buildShape(),
      values: { summary: "S" },
    });

    const reasons = changeSet.blockers.map((blocker) => blocker.reason).join(" ");

    expect(reasons).toContain("project");
    expect(reasons).toContain("issue type");
  });

  it("names a field the instance requires and the operator left empty", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft(),
      shape: buildShape({ customfield_10600: { name: "Program Increment", required: true } }),
      values: { summary: "S" },
    });

    expect(changeSet.blockers.map((blocker) => blocker.reason)).toContain(
      "Jira requires Program Increment for this issue type.",
    );
  });

  it("refuses to write at all when it could not read what the type requires", () => {
    // An unreadable create screen is not an empty one. Proceeding here would
    // create an issue missing fields Jira was about to demand.
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft(),
      shape: describeUnavailableShape("Jira could not be reached."),
      values: { summary: "S" },
    });

    expect(changeSet.blockers.map((blocker) => blocker.reason).join(" ")).toContain(
      "could not read what this issue type requires",
    );
  });

  it("makes the whole set unappliable, so a partial write cannot happen", () => {
    const changeSet = buildAuthoringChangeSet({
      draft: buildCreatableDraft({ summary: "" }),
      shape: buildShape(),
      values: { description: "D", customfield_10500: "Run" },
    });

    expect(changeSet.blockers.length).toBeGreaterThan(0);
    expect(changeSet.plannedChanges.length).toBeGreaterThan(0);
    // Changes exist AND blockers exist: the gate refuses the action as a whole
    // rather than writing the fields that happen to be fine.
  });
});
