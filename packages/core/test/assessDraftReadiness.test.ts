// assessDraftReadiness.test.ts — Advice that cannot become a refusal.
//
// A readiness finding says the draft could be better. A blocking condition says
// Jira will refuse it. Conflating them makes people ignore both: an advisory
// item that stops the button trains somebody to dismiss real refusals, and a
// real refusal dressed as advice gets dismissed.
//
// The last test in this file is a TYPE-level one. It asserts that a finding
// cannot be handed to something expecting a blocker — not by convention, but
// because the compiler refuses. A distinction the interface is meant to show is
// worth having the compiler hold.
//
// The checks are the shipped ones, read through the projection, because a second
// implementation for drafts is how the predecessor acquired five live
// divergences between two rule engines.

import { describe, expect, it } from "vitest";

import { assessDraftReadiness } from "../src/authoring/assessDraftReadiness.js";
import type { ReadinessFinding } from "../src/authoring/assessDraftReadiness.js";
import { buildEmptyDraft } from "../src/authoring/draft.js";
import type { ChangeBlocker } from "../src/apply/buildChangeSet.js";
import type { CheckDefinition } from "../src/checks/defineCheck.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import type { WorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";

const NOW = "2026-09-08T09:14:00.000Z";

/** A check that fires when the summary is missing. */
const NEEDS_SUMMARY: CheckDefinition = {
  checkId: "needs-summary",
  title: "No summary",
  whyItMatters: "Nobody can recognise the issue in a list without one.",
  severity: "high",
  requiredConcepts: [],
  isInPopulation: () => true,
  hasFinding: (issue) => !issue.fields.has("summary"),
};

/** A check that needs a concept this instance may not have mapped. */
const NEEDS_CRITERIA: CheckDefinition = {
  checkId: "needs-criteria",
  title: "No acceptance criteria",
  whyItMatters: "A tester cannot check what nobody wrote down.",
  severity: "high",
  requiredConcepts: ["acceptanceCriteria"],
  isInPopulation: () => true,
  hasFinding: (issue) => !issue.fields.has("customfield_ac"),
};

/** A configuration in which the named concepts are mapped and both checks run. */
function buildConfiguration(availableConcepts: readonly string[]): WorkspaceConfiguration {
  const base = buildDefaultWorkspaceConfiguration();
  return {
    ...base,
    enabledCheckIds: ["needs-summary", "needs-criteria"],
    fieldMap: {
      ...base.fieldMap,
      acceptanceCriteria: availableConcepts.includes("acceptanceCriteria")
        ? { state: "resolved", fieldId: "customfield_ac", jiraName: "Acceptance Criteria", confirmedAt: NOW }
        : { state: "unmapped" },
    },
  };
}

/** Assesses a draft against the two checks above. */
function assess(
  draft = buildEmptyDraft(NOW),
  availableConcepts: readonly string[] = ["acceptanceCriteria"],
) {
  return assessDraftReadiness({
    draft,
    checks: [NEEDS_SUMMARY, NEEDS_CRITERIA],
    configuration: buildConfiguration(availableConcepts),
    acceptanceCriteriaFieldId: "customfield_ac",
    issueTypeName: "Story",
    nowIso: NOW,
  });
}

describe("what it finds", () => {
  it("reports a draft missing the things the checks care about", () => {
    const assessment = assess();

    expect(assessment.findings.map((finding) => finding.checkId)).toEqual([
      "needs-summary",
      "needs-criteria",
    ]);
  });

  it("finds nothing once the draft holds them", () => {
    const draft = {
      ...buildEmptyDraft(NOW),
      summary: "Show enrolment status",
      acceptanceCriteria: "Given a plan change…",
    };

    expect(assess(draft).findings).toHaveLength(0);
  });

  it("says why each one matters, since a finding nobody understands is ignored", () => {
    expect(assess().findings.at(0)?.whyItMatters).toContain("recognise the issue");
  });
});

describe("a check that could not run", () => {
  it("is reported rather than dropped", () => {
    // A check that silently did not run reads exactly like a check that passed,
    // which is the defect this whole product exists to remove.
    const assessment = assess(buildEmptyDraft(NOW), []);

    expect(assessment.unassessed.map((check) => check.checkId)).toEqual(["needs-criteria"]);
  });

  it("names the concept that is missing, so the reason is actionable", () => {
    expect(assess(buildEmptyDraft(NOW), []).unassessed.at(0)?.reason).toContain(
      "acceptanceCriteria",
    );
  });

  it("does not appear as a finding, because not knowing is not the same as failing", () => {
    const assessment = assess(buildEmptyDraft(NOW), []);

    expect(assessment.findings.map((finding) => finding.checkId)).not.toContain("needs-criteria");
  });
});

describe("advice cannot become a refusal", () => {
  it("marks every finding as advisory on the value itself", () => {
    // Stated on the value so a renderer cannot forget to say it.
    expect(assess().findings.every((finding) => finding.isAdvisory)).toBe(true);
  });

  it("is a different type from a blocking condition — the compiler holds this", () => {
    const finding: ReadinessFinding = {
      checkId: "needs-summary",
      title: "No summary",
      whyItMatters: "…",
      isAdvisory: true,
    };

    // @ts-expect-error A readiness finding is not a ChangeBlocker and must never
    // be usable as one. If this line ever compiles, the distinction the
    // interface is meant to show has been lost in the types.
    const blocker: ChangeBlocker = finding;

    expect(blocker).toBeDefined();
  });

  it("carries no issue key, which is what makes it unusable as a blocker", () => {
    expect("issueKey" in assess().findings[0]!).toBe(false);
  });
});
