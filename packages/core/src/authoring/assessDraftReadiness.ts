// assessDraftReadiness.ts — Advice, and a type that cannot become a refusal.
//
// A readiness finding tells somebody their draft could be better. A blocking
// condition tells them Jira will refuse it. Conflating those is what makes
// people ignore both: an advisory item that stops the button trains them to
// dismiss real refusals, and a real refusal presented as advice gets dismissed.
//
// So `ReadinessFinding` is a different TYPE from `ChangeBlocker`, and the
// difference is load-bearing rather than cosmetic — it has no `issueKey`, so it
// cannot be passed where a blocker is required. The compiler enforces the
// distinction the interface is meant to show.
//
// The checks themselves are the shipped ones, read through the projection. A
// second implementation for drafts is how the predecessor ended up with five
// live divergences between two rule engines.

import { ALL_CHECKS } from "../checks/registry.js";
import { buildCheckContext } from "../checks/runChecks.js";
import type { CheckDefinition } from "../checks/defineCheck.js";
import { buildIssueSet, buildRetrievalRecord } from "../model/issueSet.js";
import type { WorkspaceConfiguration } from "../workspace/workspaceConfig.js";

import { projectDraftAsIssue } from "./projectDraftAsIssue.js";
import type { AuthoringDraft } from "./draft.js";

/**
 * One thing that could be better about a draft.
 *
 * Deliberately NOT a `ChangeBlocker`. It carries no issue key, so no code path
 * can hand one to the change set and have it refuse a write.
 */
export interface ReadinessFinding {
  readonly checkId: string;
  readonly title: string;
  /** Why it is worth doing. A finding nobody understands is one nobody acts on. */
  readonly whyItMatters: string;
  /** Always advisory. Stated on the value so a renderer cannot forget. */
  readonly isAdvisory: true;
}

/** Why a check could not be run at all. */
export interface UnassessedCheck {
  readonly checkId: string;
  readonly title: string;
  /** Which concept is missing, so the reason is actionable. */
  readonly reason: string;
}

/** What an assessment came back with. */
export interface ReadinessAssessment {
  readonly findings: readonly ReadinessFinding[];
  /**
   * Checks that could not run, and why.
   *
   * Reported rather than dropped: a check that silently did not run reads as a
   * check that passed, which is the defect this whole product exists to remove.
   */
  readonly unassessed: readonly UnassessedCheck[];
}

/**
 * Runs the shipped checks over a draft.
 *
 * @param issueTypeName What the instance calls the chosen type, so population
 *                      predicates that read the type behave as they would live.
 */
export function assessDraftReadiness(input: {
  readonly draft: AuthoringDraft;
  readonly configuration: WorkspaceConfiguration;
  readonly acceptanceCriteriaFieldId: string | null;
  readonly issueTypeName: string;
  readonly nowIso: string;
  /** Overridable so a test can name its own checks. Defaults to the shipped set. */
  readonly checks?: readonly CheckDefinition[];
}): ReadinessAssessment {
  const issue = projectDraftAsIssue({
    draft: input.draft,
    acceptanceCriteriaFieldId: input.acceptanceCriteriaFieldId,
    issueTypeName: input.issueTypeName,
    nowIso: input.nowIso,
  });

  // The draft is the only issue in scope, so it IS the set. Building it here
  // rather than asking the caller for one keeps a screen from having to
  // fabricate a retrieval that never happened.
  const issueSet = buildIssueSet(
    buildRetrievalRecord({
      jql: "",
      fieldsRequested: [],
      expandRequested: [],
      startedAtIso: input.nowIso,
      durationMs: 0,
      totalMatchingCount: 1,
      fetchedCount: 1,
      ceiling: 1,
      // A draft has no change history, and saying "none" would be a claim
      // about something nobody retrieved.
      changelogCoverage: "none",
      workspaceFingerprint: "",
      failure: null,
    }),
    [issue],
  );

  const context = buildCheckContext(issueSet, input.configuration, []);
  const checks = (input.checks ?? ALL_CHECKS).filter((check) =>
    input.configuration.enabledCheckIds.includes(check.checkId),
  );

  const findings: ReadinessFinding[] = [];
  const unassessed: UnassessedCheck[] = [];

  for (const check of checks) {
    const missingConcept = check.requiredConcepts.find(
      (conceptId) => !context.isConceptAvailable(conceptId),
    );
    if (missingConcept !== undefined) {
      unassessed.push({
        checkId: check.checkId,
        title: check.title,
        reason: `${missingConcept} is not mapped on this Jira, so this cannot be assessed.`,
      });
      continue;
    }

    if (!check.isInPopulation(issue, context)) continue;
    if (!check.hasFinding(issue, context)) continue;

    findings.push({
      checkId: check.checkId,
      title: check.title,
      whyItMatters: check.whyItMatters,
      isAdvisory: true,
    });
  }

  return { findings, unassessed };
}
