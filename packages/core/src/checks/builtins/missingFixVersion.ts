// missingFixVersion.ts — Delivered work nobody can trace to a release.
//
// This check exists to prove a specific regression is gone.
//
// In the predecessor it was gated to feature-level issues, and consequently
// reported NOTHING across a backlog of seventy-two affected items. A tile
// showing zero out of a real backlog reads as a tool that is not checking
// anything, and that is precisely what it was.
//
// So its population is every issue type that can carry a fix version - stories,
// tasks and defects included, sub-tasks excluded because they cannot. And it
// depends on NO mapped concept: fixVersions is a field Jira always provides,
// which is why this check stays measurable when the other two cannot run. That
// contrast is the whole hygiene demonstration.

import { defineCheck } from "../defineCheck.js";
import { combineJql } from "../../jira/jqlValue.js";

/** Jira's own field for release membership. Present on every instance. */
const FIX_VERSIONS_FIELD_ID = "fixVersions";

export const MISSING_FIX_VERSION = defineCheck({
  checkId: "missing-fix-version",
  title: "Work with no fix version",
  whyItMatters:
    "Without a fix version an item cannot be traced to a release, so nobody can answer what " +
    "shipped when - including the person being asked in a review.",
  severity: "medium",

  // Deliberately empty. This check needs no confirmed mapping, which is what
  // lets it keep working while concept-dependent checks report not measurable.
  requiredConcepts: [],

  // Every delivery type, not only feature-level ones. This predicate IS the
  // regression test for the seventy-two.
  isInPopulation: (issue, context) => context.isDeliveryIssue(issue),

  hasFinding: (issue) => {
    const fixVersions = issue.fields.get(FIX_VERSIONS_FIELD_ID);
    return !Array.isArray(fixVersions) || fixVersions.length === 0;
  },

  // Expressible in JQL directly, so the link and the count are the same
  // question asked twice. Note the JQL alias is `fixVersion`, singular - the
  // predecessor used the REST name here and produced a link that 400'd beside a
  // correct count, which reads to a user as the number being wrong.
  buildDrillThroughJql: (context) =>
    combineJql(context.issueSet.record.jql, "fixVersion is EMPTY"),

  fixPackId: "set-missing-fix-version",
});
