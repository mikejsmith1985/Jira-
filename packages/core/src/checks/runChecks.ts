// runChecks.ts — Evaluating checks in an order that cannot lie.
//
// The order of the guards IS the contract:
//
//   1. A failed retrieval poisons everything. Nothing ran, so nothing may be
//      reported.
//   2. A required concept that is unresolved blocks the check BEFORE evaluation.
//      A check whose field could not be found must never get as far as
//      concluding that everything passed.
//   3. Only then is the population partitioned and the condition applied.
//
// Step 2 before step 3 is the whole reason the predecessor's failure mode is
// unreachable here. There, a check with an unresolvable field evaluated anyway,
// found nothing, and rendered green.

import { measure } from "../measure/measure.js";
import type { Measure } from "../measure/measure.js";
import type { ConceptId } from "../fields/conceptId.js";
import {
  listAbsentConcepts,
  listUnresolvedConcepts,
  readConceptValue,
} from "../fields/resolveFieldMap.js";
import type { IssueSet } from "../model/issueSet.js";
import type { JiraFieldDescriptor } from "../jira/jiraAdapter.js";
import type { WorkspaceConfiguration } from "../workspace/workspaceConfig.js";
import { isDeliveryIssueType } from "./defineCheck.js";
import type { CheckContext, CheckDefinition } from "./defineCheck.js";
import { ALL_CHECKS } from "./registry.js";

/** One check's outcome, plus what a surface needs to render it. */
export interface CheckResult {
  readonly check: CheckDefinition;
  readonly measure: Measure;
  /** The Jira query that opens exactly the flagged issues, when one can be built. */
  readonly drillThroughJql: string | null;
  /** Which concept resolved to which field, so the reader can audit the mapping. */
  readonly fieldsRead: readonly { readonly conceptId: ConceptId; readonly fieldId: string; readonly jiraName: string }[];
}

/** Builds the context every check reads through. */
export function buildCheckContext(
  issueSet: IssueSet,
  configuration: WorkspaceConfiguration,
  fieldCatalogue: readonly JiraFieldDescriptor[],
): CheckContext {
  return {
    readConcept: (issue, conceptId) => readConceptValue(issue, conceptId, configuration.fieldMap),
    isConceptAvailable: (conceptId) => configuration.fieldMap[conceptId].state === "resolved",
    isDeliveryIssue: isDeliveryIssueType,
    issueSet,
    configuration,
    fieldCatalogue,
  };
}

/** Names which field each of a check's concepts actually resolved to. */
function describeFieldsRead(
  check: CheckDefinition,
  configuration: WorkspaceConfiguration,
): CheckResult["fieldsRead"] {
  return check.requiredConcepts.flatMap((conceptId) => {
    const entry = configuration.fieldMap[conceptId];
    if (entry.state !== "resolved") return [];
    return [{ conceptId, fieldId: entry.fieldId, jiraName: entry.jiraName }];
  });
}

/** Runs one check over one retrieval. */
export function runCheck(
  check: CheckDefinition,
  issueSet: IssueSet,
  context: CheckContext,
): CheckResult {
  const configuration = context.configuration;
  const fieldsRead = describeFieldsRead(check, configuration);

  // Guard 2a — a concept the user has not answered for. Amber and blocking:
  // there is a question outstanding, and until it is answered no result is
  // available. Evaluation does not run.
  const unresolved = listUnresolvedConcepts(configuration.fieldMap, check.requiredConcepts);
  if (unresolved.length > 0) {
    return {
      check,
      measure: measure({
        sourceId: check.checkId,
        flaggedKeys: [],
        eligibleKeys: [],
        issueSet,
        blocker: { kind: "concept-unmapped", conceptIds: unresolved },
      }),
      drillThroughJql: null,
      fieldsRead,
    };
  }

  // Guard 2b — a concept the user has confirmed this instance does not have.
  // Grey and inapplicable: the question IS answered, and the answer is that
  // there is nothing here to check. Excluded from aggregates either way, and a
  // pass in neither case.
  const absent = listAbsentConcepts(configuration.fieldMap, check.requiredConcepts);
  if (absent.length > 0) {
    return {
      check,
      measure: measure({
        sourceId: check.checkId,
        flaggedKeys: [],
        eligibleKeys: [],
        issueSet,
      }),
      drillThroughJql: null,
      fieldsRead,
    };
  }

  const eligibleIssues = issueSet.issues.filter((issue) => check.isInPopulation(issue, context));
  const flaggedIssues = eligibleIssues.filter((issue) => check.hasFinding(issue, context));

  const flaggedKeys = flaggedIssues.map((issue) => issue.key);
  const built = measure({
    sourceId: check.checkId,
    flaggedKeys,
    eligibleKeys: eligibleIssues.map((issue) => issue.key),
    issueSet,
  });

  return {
    check,
    measure: built,
    drillThroughJql:
      flaggedKeys.length > 0 && check.buildDrillThroughJql !== undefined
        ? check.buildDrillThroughJql(context, flaggedKeys)
        : null,
    fieldsRead,
  };
}

/**
 * Runs every enabled check.
 *
 * Guard 1 lives here: when the retrieval failed, every check is unresolved and
 * no overall figure exists at all.
 */
export function runChecks(
  issueSet: IssueSet,
  configuration: WorkspaceConfiguration,
  fieldCatalogue: readonly JiraFieldDescriptor[],
): readonly CheckResult[] {
  const context = buildCheckContext(issueSet, configuration, fieldCatalogue);
  const enabled = ALL_CHECKS.filter((check) =>
    configuration.enabledCheckIds.includes(check.checkId),
  );

  return enabled.map((check) => {
    if (issueSet.record.failure !== null) {
      return {
        check,
        measure: measure({
          sourceId: check.checkId,
          flaggedKeys: [],
          eligibleKeys: [],
          issueSet,
        }),
        drillThroughJql: null,
        fieldsRead: describeFieldsRead(check, configuration),
      };
    }
    return runCheck(check, issueSet, context);
  });
}

/** An overall figure, counting only what could actually be measured. */
export interface CheckSummary {
  readonly measuredCount: number;
  readonly flaggedIssueCount: number;
  readonly notApplicableCount: number;
  readonly notMeasurableCount: number;
  /** Null when nothing could be measured; there is no honest score to give. */
  readonly passRate: number | null;
}

/**
 * Summarises a run.
 *
 * Only `measured` results contribute. Inapplicable and unmeasurable checks are
 * counted separately and shown separately — there is no denominator into which
 * an unanswerable check can disappear, which is how a screen of amber tiles
 * would otherwise average out to a comfortable green.
 */
export function summariseChecks(results: readonly CheckResult[]): CheckSummary {
  const measured = results.filter((result) => result.measure.state === "measured");
  const flaggedIssueKeys = new Set<string>();
  let eligibleTotal = 0;
  let flaggedTotal = 0;

  for (const result of measured) {
    if (result.measure.state !== "measured") continue;
    eligibleTotal += result.measure.eligibleKeys.length;
    flaggedTotal += result.measure.flaggedKeys.length;
    for (const key of result.measure.flaggedKeys) flaggedIssueKeys.add(key);
  }

  return {
    measuredCount: measured.length,
    flaggedIssueCount: flaggedIssueKeys.size,
    notApplicableCount: results.filter((result) => result.measure.state === "not-applicable").length,
    notMeasurableCount: results.filter((result) => result.measure.state === "unresolved").length,
    passRate: eligibleTotal === 0 ? null : (eligibleTotal - flaggedTotal) / eligibleTotal,
  };
}
