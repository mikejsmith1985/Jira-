// registry.ts — The catalogue, derived rather than maintained.
//
// This array is the only list. The catalogue shown in settings, the identifier
// union, and the set the scan evaluates all come from it, so a check cannot be
// evaluated without appearing and cannot appear without being evaluated.
//
// The predecessor needed four hand-synced lists for the same job, and one check
// fell out of the fourth: it was computed on every scan and then filtered out of
// every result, so it never fired in the live product and nobody noticed. That
// failure is not available here, because there is nothing to fall out of.

import { MISSING_ACCEPTANCE_CRITERIA } from "./builtins/missingAcceptanceCriteria.js";
import { MISSING_FIX_VERSION } from "./builtins/missingFixVersion.js";
import { MISSING_STORY_POINTS } from "./builtins/missingStoryPoints.js";
import type { CheckDefinition } from "./defineCheck.js";

/**
 * Every check this build ships.
 *
 * Three, chosen so that between them they exercise every reportable state: two
 * depend on a mapped concept and demonstrate "not measurable" when it is
 * missing; one depends only on a field Jira always provides and therefore stays
 * measurable when the others cannot run.
 */
export const ALL_CHECKS: readonly CheckDefinition[] = [
  MISSING_STORY_POINTS,
  MISSING_ACCEPTANCE_CRITERIA,
  MISSING_FIX_VERSION,
];

/** Every check identifier, derived from the definitions themselves. */
export const ALL_CHECK_IDS: readonly string[] = ALL_CHECKS.map((check) => check.checkId);

/** Finds a check by identifier, or undefined when nothing declares it. */
export function findCheck(checkId: string): CheckDefinition | undefined {
  return ALL_CHECKS.find((check) => check.checkId === checkId);
}
