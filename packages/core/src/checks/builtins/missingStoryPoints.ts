// missingStoryPoints.ts — Estimable work with no estimate.
//
// Depends on a mapped concept, so on an unconfigured instance it reports as NOT
// MEASURABLE rather than as passing. That is the point of it being in the
// shipped three: it demonstrates the state the predecessor could not express.
//
// It also carries a specific history. The predecessor hardcoded the story-points
// field id, that id was wrong for this instance, and forty-one pointed issues
// were reported unpointed while accepted fixes wrote into a field nothing reads.
// This check reads the concept, never a field id, so the same mistake has
// nowhere to live.

import { defineCheck, hasMeaningfulValue } from "../defineCheck.js";
import { buildIssueKeyClause, combineJql } from "../../jira/jqlValue.js";

/** Issue types that carry their own estimate. Epics and features are sized elsewhere. */
const ESTIMABLE_TYPE_NAMES: readonly string[] = ["story", "task", "defect", "bug", "improvement"];

export const MISSING_STORY_POINTS = defineCheck({
  checkId: "missing-story-points",
  title: "Estimable work with no estimate",
  whyItMatters:
    "An unestimated item cannot be forecast, cannot be balanced against capacity, and quietly " +
    "distorts every throughput figure it appears in.",
  severity: "medium",
  requiredConcepts: ["storyPoints"],

  isInPopulation: (issue, context) => {
    if (!context.isDeliveryIssue(issue)) return false;
    return ESTIMABLE_TYPE_NAMES.includes(issue.issueTypeName.trim().toLowerCase());
  },

  hasFinding: (issue, context) => !hasMeaningfulValue(context.readConcept(issue, "storyPoints")),

  buildDrillThroughJql: (context, flaggedKeys) =>
    combineJql(context.issueSet.record.jql, buildIssueKeyClause(flaggedKeys) ?? "key is not empty"),

  fixPackId: "fix-story-points",
});
