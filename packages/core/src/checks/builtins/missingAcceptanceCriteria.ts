// missingAcceptanceCriteria.ts — Work nobody can tell is finished.
//
// The second concept-dependent check, and the one with a fix pack behind it. On
// an instance where the acceptance-criteria field has not been confirmed, it
// reports as not measurable — which is the behaviour the trust demo turns on:
// unmap the field and watch this go amber while missing-fix-version stays green.

import { defineCheck, hasMeaningfulValue } from "../defineCheck.js";
import { buildIssueKeyClause, combineJql } from "../../jira/jqlValue.js";

/** Types whose completion is judged against written criteria. */
const CRITERIA_BEARING_TYPE_NAMES: readonly string[] = ["story", "task", "feature", "epic", "improvement"];

export const MISSING_ACCEPTANCE_CRITERIA = defineCheck({
  checkId: "missing-acceptance-criteria",
  title: "Work with no acceptance criteria",
  whyItMatters:
    "Without written criteria, 'done' is whatever the person who picked it up decided it was. " +
    "That is the disagreement that surfaces in review, when it is expensive.",
  severity: "high",
  requiredConcepts: ["acceptanceCriteria"],

  isInPopulation: (issue, context) => {
    if (!context.isDeliveryIssue(issue)) return false;
    return CRITERIA_BEARING_TYPE_NAMES.includes(issue.issueTypeName.trim().toLowerCase());
  },

  hasFinding: (issue, context) =>
    !hasMeaningfulValue(context.readConcept(issue, "acceptanceCriteria")),

  buildDrillThroughJql: (context, flaggedKeys) =>
    combineJql(context.issueSet.record.jql, buildIssueKeyClause(flaggedKeys) ?? "key is not empty"),

  fixPackId: "fix-acceptance-criteria",
});
