// defineCheck.ts — One declaration, in one file.
//
// The predecessor required a check to be registered in FOUR hand-synced lists:
// a flag catalogue, an evaluation call list, an identifier array, and an admin
// rule catalogue. One check fell out of the fourth, so it was computed on every
// scan and then filtered out of every result. It never fired in the live product
// and nobody knew.
//
// Here a check is one object. The catalogue, the identifier union and the
// settings screen all derive from the registry, so a check cannot exist without
// appearing and cannot appear without being evaluated.
//
// Two rules are enforced by test rather than by convention: no check may reach
// Jira, and no check may name a `customfield_` id. Both are read through the
// context, which is the only door.

import type { ConceptId } from "../fields/conceptId.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";
import type { JiraFieldDescriptor } from "../jira/jiraAdapter.js";
import type { WorkspaceConfiguration } from "../workspace/workspaceConfig.js";

/** How much a finding matters. */
export type CheckSeverity = "high" | "medium" | "low";

/** Everything a check may see. Note what is absent: any way to reach Jira. */
export interface CheckContext {
  /** The ONLY way a check reads a field. No raw field id is reachable from here. */
  readConcept(issue: DetailedIssue, conceptId: ConceptId): unknown;
  /** Whether a concept has a confirmed field behind it on this instance. */
  isConceptAvailable(conceptId: ConceptId): boolean;
  /** True for the issue types this team treats as deliverable work. */
  isDeliveryIssue(issue: DetailedIssue): boolean;
  readonly issueSet: IssueSet;
  readonly configuration: WorkspaceConfiguration;
  readonly fieldCatalogue: readonly JiraFieldDescriptor[];
}

/** One quality rule, declared once. */
export interface CheckDefinition {
  readonly checkId: string;
  readonly title: string;
  /** Shown to the user. A finding nobody understands is a finding nobody acts on. */
  readonly whyItMatters: string;
  readonly severity: CheckSeverity;
  /** Concepts this check needs. Any unresolved one blocks it BEFORE evaluation. */
  readonly requiredConcepts: readonly ConceptId[];
  /** The population this check governs. This IS the denominator. */
  isInPopulation(issue: DetailedIssue, context: CheckContext): boolean;
  /** The condition. Only ever called for issues in the population. */
  hasFinding(issue: DetailedIssue, context: CheckContext): boolean;
  /** Builds the JQL that opens exactly the flagged issues in Jira. */
  buildDrillThroughJql?(context: CheckContext, flaggedKeys: readonly string[]): string;
  readonly fixPackId?: string;
}

/**
 * Declares a check.
 *
 * A pass-through today, and deliberately so: it is the single point at which a
 * declaration could later be validated, and having it means adding that
 * validation never becomes a change to every check file.
 */
export function defineCheck(definition: CheckDefinition): CheckDefinition {
  return definition;
}

/** Issue types this team treats as deliverable work carrying a fix version. */
export const DELIVERY_ISSUE_TYPE_NAMES: readonly string[] = [
  "story",
  "task",
  "defect",
  "bug",
  "feature",
  "epic",
  "improvement",
  "spike",
];

/**
 * Is this an issue type the delivery checks govern?
 *
 * Sub-tasks are excluded because they do not carry their own fix version. Note
 * what this is NOT: it is not "feature-like". The predecessor used a
 * feature-only predicate as a stand-in for the delivery population, and the
 * missing-fix-version check consequently reported nothing across seventy-two
 * affected items.
 */
export function isDeliveryIssueType(issue: DetailedIssue): boolean {
  const typeName = issue.issueTypeName.trim().toLowerCase();
  if (typeName.includes("sub-task") || typeName.includes("subtask")) return false;
  return DELIVERY_ISSUE_TYPE_NAMES.includes(typeName);
}

/** Is a value meaningfully present, rather than blank or an empty collection? */
export function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}
