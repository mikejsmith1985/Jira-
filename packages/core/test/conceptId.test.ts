// conceptId.test.ts — Guards the small closed set of things a rule may read.
//
// The predecessor bound its story-points check to a hardcoded field id that was
// wrong for this instance, reporting forty-one pointed issues as unpointed. The
// defence is that a rule names a concept and never a field id, so this file
// asserts the concept set stays closed, stays described, and — critically —
// never invites the substring matching that would let "Story Points Estimate"
// silently satisfy a request for "Story Points".

import { describe, expect, it } from "vitest";

import { ALL_CONCEPT_IDS, CONCEPT_DESCRIPTIONS } from "../src/fields/conceptId.js";

describe("the concept set", () => {
  it("is small and closed, because each entry becomes something every install must confirm", () => {
    expect(ALL_CONCEPT_IDS).toEqual([
      "storyPoints",
      "acceptanceCriteria",
      "parentFeature",
      "targetStart",
      "targetEnd",
      "programIncrement",
    ]);
  });

  it("puts the concepts this feature's checks need first, so partial setup still works", () => {
    expect(ALL_CONCEPT_IDS.slice(0, 2)).toEqual(["storyPoints", "acceptanceCriteria"]);
  });

  it("contains no duplicates", () => {
    expect(new Set(ALL_CONCEPT_IDS).size).toBe(ALL_CONCEPT_IDS.length);
  });
});

describe("concept descriptions", () => {
  it("describes every concept, so setup can never show an unlabelled row", () => {
    for (const conceptId of ALL_CONCEPT_IDS) {
      expect(CONCEPT_DESCRIPTIONS[conceptId].label.length).toBeGreaterThan(0);
    }
  });

  it("offers at least one expected Jira field name for every concept", () => {
    for (const conceptId of ALL_CONCEPT_IDS) {
      expect(CONCEPT_DESCRIPTIONS[conceptId].expectedJiraNames.length).toBeGreaterThan(0);
    }
  });

  it("describes exactly the concepts that exist, and no others", () => {
    expect(Object.keys(CONCEPT_DESCRIPTIONS).sort()).toEqual([...ALL_CONCEPT_IDS].sort());
  });

  it("keeps story points' two candidate names distinct, since only exact matching is safe", () => {
    const storyPointsNames = CONCEPT_DESCRIPTIONS.storyPoints.expectedJiraNames;

    expect(storyPointsNames).toContain("Story Points");
    expect(storyPointsNames).toContain("Story Point Estimate");
    // Neither is a prefix of the other under exact comparison, which is the
    // whole reason substring matching is banned: on this instance the two names
    // point at different fields, and only one of them holds the real value.
    expect(storyPointsNames[0]).not.toBe(storyPointsNames[1]);
  });
});

describe("the program increment field", () => {
  it("matches the name this instance actually uses", () => {
    // The field is called "PI (Program Increment)". None of the shorter forms
    // matched it, and because matching is exact by design, one of the most
    // important fields in the instance reported as absent. Exactness is right;
    // the list being too short was the bug.
    expect(CONCEPT_DESCRIPTIONS.programIncrement.expectedJiraNames).toContain(
      "PI (Program Increment)",
    );
  });

  it("is spelled the way Jira and SAFe spell it", () => {
    // A label that disagrees with the field it names reads as a different
    // concept to the person hunting for it.
    expect(CONCEPT_DESCRIPTIONS.programIncrement.label).toBe("Program increment");
    expect(CONCEPT_DESCRIPTIONS.programIncrement.label).not.toMatch(/programme/i);
  });
});
