// draft.test.ts — The one field the whole feature turns on.
//
// `existingIssueKey` decides create versus update and nothing else does. These
// assertions are about that field behaving as a single switch rather than as one
// hint among several — because the failure it prevents is a duplicate Feature
// raised while somebody was trying to improve a stub, and that failure looks
// like success until a colleague finds two.
//
// The narrative is asserted separately for the same reason it exists: it is the
// operator's own words, kept to steer the assistant, and it has no field id, so
// there is nowhere for it to reach Jira even by accident.

import { describe, expect, it } from "vitest";

import {
  addSource,
  buildEmptyDraft,
  isEnrichingExistingIssue,
  readDraftFieldValues,
  removeSource,
} from "../src/authoring/draft.js";
import type { AuthoringSource } from "../src/authoring/draft.js";

/** The moment every draft in this suite was made. */
const NOW = "2026-09-08T09:14:00.000Z";

/** One piece of gathered material. */
function buildSource(overrides: Partial<AuthoringSource> = {}): AuthoringSource {
  return {
    sourceId: "s1",
    label: "the brief",
    text: "Members cannot see their enrolment status after a plan change.",
    addedAtIso: NOW,
    ...overrides,
  };
}

describe("a draft nobody has written yet", () => {
  it("is a normal starting state rather than an error", () => {
    const draft = buildEmptyDraft(NOW);

    expect(draft.summary).toBe("");
    expect(draft.sources).toHaveLength(0);
  });

  it("will create a new issue, because no key names an existing one", () => {
    expect(isEnrichingExistingIssue(buildEmptyDraft(NOW))).toBe(false);
  });

  it("has loaded no issue, which is different from having loaded an empty one", () => {
    // null means "we never loaded an issue"; an empty object would mean "we
    // loaded an issue and it had no values". A save compares against this, so
    // conflating them would write every field on an issue nobody loaded.
    expect(buildEmptyDraft(NOW).loadedFieldValues).toBeNull();
  });
});

describe("the field that decides create or update", () => {
  it("says update when a key names an existing issue", () => {
    const draft = { ...buildEmptyDraft(NOW), existingIssueKey: "ENCUC-1142" };

    expect(isEnrichingExistingIssue(draft)).toBe(true);
  });

  it("treats whitespace as no key, so a stray space cannot change the outcome", () => {
    const draft = { ...buildEmptyDraft(NOW), existingIssueKey: "   " };

    expect(isEnrichingExistingIssue(draft)).toBe(false);
  });

  it("goes back to creating when the key is cleared", () => {
    const loaded = { ...buildEmptyDraft(NOW), existingIssueKey: "ENCUC-1142" };
    const cleared = { ...loaded, existingIssueKey: null };

    expect(isEnrichingExistingIssue(cleared)).toBe(false);
  });
});

describe("gathered material", () => {
  it("is kept with its label, so the operator can see what they are writing from", () => {
    const draft = addSource(buildEmptyDraft(NOW), buildSource());

    expect(draft.sources.at(0)?.label).toBe("the brief");
    expect(draft.sources.at(0)?.text).toContain("enrolment status");
  });

  it("changes no field value by itself", () => {
    // A source is reference material. If adding one could populate a field, a
    // pasted email would become an issue nobody wrote.
    const before = readDraftFieldValues(buildEmptyDraft(NOW), "summary", "description", null);
    const after = readDraftFieldValues(
      addSource(buildEmptyDraft(NOW), buildSource()),
      "summary",
      "description",
      null,
    );

    expect(after).toEqual(before);
  });

  it("can be removed", () => {
    const withTwo = addSource(addSource(buildEmptyDraft(NOW), buildSource()), buildSource({ sourceId: "s2" }));

    expect(removeSource(withTwo, "s1", NOW).sources.map((source) => source.sourceId)).toEqual(["s2"]);
  });
});

describe("what the draft would write", () => {
  it("omits an empty field rather than writing a blank over a real value", () => {
    const draft = { ...buildEmptyDraft(NOW), summary: "Show enrolment status" };

    const values = readDraftFieldValues(draft, "summary", "description", null);

    expect(values.summary).toBe("Show enrolment status");
    expect("description" in values).toBe(false);
  });

  it("never includes the operator's own words", () => {
    // The narrative has no field id, so it cannot appear here. This asserts the
    // property rather than a filter, because a filter is something a later edit
    // can remove.
    const draft = {
      ...buildEmptyDraft(NOW),
      summary: "Show enrolment status",
      operatorNarrative: "Jana says members ring in every time a plan changes.",
    };

    const values = readDraftFieldValues(draft, "summary", "description", "customfield_ac");

    expect(JSON.stringify(values)).not.toContain("Jana");
  });

  it("omits acceptance criteria when the instance has no field for it", () => {
    const draft = { ...buildEmptyDraft(NOW), summary: "S", acceptanceCriteria: "Given a member…" };

    const values = readDraftFieldValues(draft, "summary", "description", null);

    expect(Object.keys(values)).toEqual(["summary"]);
  });
});
