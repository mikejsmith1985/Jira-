// conceptId.ts — The named information Jira+ needs, independent of where any
// particular Jira instance keeps it.
//
// A rule names a concept. It never names a `customfield_` id. That separation is
// what stopped the predecessor's duplicate default tables from being possible
// here: there, a hardcoded `customfield_10028` silently bound the story-points
// check to the wrong field on this very instance, reporting forty-one pointed
// issues as unpointed and writing accepted "fixes" into a field nothing reads.
//
// The set is deliberately closed and deliberately short. Adding a concept is an
// act with consequences — it becomes something every installation must confirm
// before the checks depending on it can run.

/** A named piece of information a rule may read, once an instance maps it to a field. */
export type ConceptId =
  | "storyPoints"
  | "acceptanceCriteria"
  | "parentFeature"
  | "targetStart"
  | "targetEnd"
  | "programIncrement";

/**
 * Every concept, in the order setup presents them.
 *
 * Story points and acceptance criteria come first because the three checks this
 * feature ships depend on them, so a user who confirms only the first two has a
 * working product.
 */
export const ALL_CONCEPT_IDS: readonly ConceptId[] = [
  "storyPoints",
  "acceptanceCriteria",
  "parentFeature",
  "targetStart",
  "targetEnd",
  "programIncrement",
];

/**
 * What each concept is called on screen, and the Jira field name setup will
 * propose an exact match against.
 *
 * Matching is exact, never substring: "Story Points Estimate" is a different
 * field from "Story Points", and quietly accepting the wrong one is the failure
 * this whole module exists to prevent.
 */
export const CONCEPT_DESCRIPTIONS: Readonly<
  Record<ConceptId, { readonly label: string; readonly expectedJiraNames: readonly string[] }>
> = {
  storyPoints: {
    label: "Story points",
    expectedJiraNames: ["Story Points", "Story Point Estimate"],
  },
  acceptanceCriteria: {
    label: "Acceptance criteria",
    expectedJiraNames: ["Acceptance Criteria"],
  },
  parentFeature: {
    label: "Parent feature",
    expectedJiraNames: ["Feature Link", "Epic Link", "Parent Link"],
  },
  targetStart: {
    label: "Target start date",
    expectedJiraNames: ["Target Start", "Target start"],
  },
  targetEnd: {
    label: "Target end date",
    expectedJiraNames: ["Target End", "Target end"],
  },
  programIncrement: {
    // "Program", not "Programme". The field is American-spelled in Jira and in
    // SAFe, and a label that disagrees with the field it names reads as a
    // different concept to the person looking for it.
    label: "Program increment",
    // The real field on this instance is called "PI (Program Increment)". None
    // of the shorter forms matched it, and because matching is exact by design,
    // one of the most important fields in the instance reported as absent.
    // Exactness is right; the list being too short was the bug.
    expectedJiraNames: [
      "PI (Program Increment)",
      "PI",
      "Program Increment",
      "Programme Increment",
    ],
  },
};
