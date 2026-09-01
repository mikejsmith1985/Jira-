// measure.ts — The only shape a quantity may take in Jira+.
//
// The predecessor rendered a bare number, and a bare number cannot say whether
// it means "all clear", "nothing here applies" or "the field could not be
// found". All three were drawn identically, and a query naming a non-existent
// field returned nothing, which appeared as a perfect score. Failure and
// success were indistinguishable.
//
// A `Measure` cannot do that. It is a union whose passing state carries both the
// items counted AND the population they were counted against, and whose
// constructor refuses to return that state when there was no population or when
// the data never arrived. The guarantee is structural: there is no code path
// from "something went wrong" to a green tile, because the value that would
// have to exist cannot be built.
//
// There is also no `count` field. A count is the length of the array the
// drill-through renders, so a number and its links cannot disagree — not
// because anyone keeps them in sync, but because they are the same array.

import type { ConceptId } from "../fields/conceptId.js";
import type { IssueSet, RetrievalFailure, RetrievalRecord } from "../model/issueSet.js";

/** A Jira field as its catalogue describes it, used when a mapping is ambiguous. */
export interface JiraFieldSummary {
  readonly fieldId: string;
  readonly jiraName: string;
  readonly schemaType: string;
}

/** Why a quantity could not be calculated. Each kind names a different next action. */
export type EvaluabilityBlocker =
  | { readonly kind: "retrieval-failed"; readonly failure: RetrievalFailure }
  | { readonly kind: "concept-unmapped"; readonly conceptIds: readonly ConceptId[] }
  | {
      readonly kind: "concept-ambiguous";
      readonly conceptId: ConceptId;
      readonly candidates: readonly JiraFieldSummary[];
    }
  | { readonly kind: "history-unavailable"; readonly affectedCount: number }
  | { readonly kind: "lens-undefined"; readonly lensId: string };

/** Where a number came from — enough to answer that without leaving the view. */
export interface MeasureProvenance {
  readonly sourceId: string;
  readonly record: RetrievalRecord;
  readonly workspaceFingerprint: string;
  readonly lensId?: string;
}

/**
 * A quantity, in one of exactly three states.
 *
 * `measured` carries both arrays deliberately: `flaggedKeys.length` is the
 * number a tile shows, `eligibleKeys.length` is its denominator, and both drill
 * through to their own list.
 */
export type Measure =
  | {
      readonly state: "measured";
      readonly flaggedKeys: readonly string[];
      readonly eligibleKeys: readonly string[];
      readonly isPartial: boolean;
      readonly provenance: MeasureProvenance;
    }
  | {
      readonly state: "not-applicable";
      readonly reason: string;
      readonly provenance: MeasureProvenance;
    }
  | {
      readonly state: "unresolved";
      readonly blocker: EvaluabilityBlocker;
      readonly provenance: MeasureProvenance;
    };

/** What a caller supplies. Everything else is derived from the issue set. */
export interface MeasureInput {
  readonly sourceId: string;
  readonly flaggedKeys: readonly string[];
  readonly eligibleKeys: readonly string[];
  readonly issueSet: IssueSet;
  readonly lensId?: string;
  /** A reason the caller already knows evaluation could not run, such as an unmapped concept. */
  readonly blocker?: EvaluabilityBlocker;
}

/** Wording shown when a check governs nothing in the current scope. */
const NOTHING_IN_SCOPE_REASON =
  "Nothing in scope matched this check's population, so there was nothing to check.";

/** Assembles the provenance every state carries, including the failing ones. */
function buildProvenance(input: MeasureInput): MeasureProvenance {
  const provenance: MeasureProvenance = {
    sourceId: input.sourceId,
    record: input.issueSet.record,
    workspaceFingerprint: input.issueSet.record.workspaceFingerprint,
  };
  return input.lensId === undefined ? provenance : { ...provenance, lensId: input.lensId };
}

/**
 * Checks that a measure's keys belong to its own population and to the retrieval.
 *
 * A flagged key outside the population would make a tile show more than its own
 * denominator; an eligible key outside the retrieval would count an issue nobody
 * fetched. Both are bugs in the caller, so both throw rather than degrade.
 */
function assertKeysAreWellFounded(input: MeasureInput): void {
  const eligible = new Set(input.eligibleKeys);

  for (const flaggedKey of input.flaggedKeys) {
    if (!eligible.has(flaggedKey)) {
      throw new Error(
        `Measure "${input.sourceId}" flagged ${flaggedKey}, which is not in its own population. ` +
          `A count may never exceed the denominator shown beside it.`,
      );
    }
  }

  for (const eligibleKey of eligible) {
    if (!input.issueSet.byKey.has(eligibleKey)) {
      throw new Error(
        `Measure "${input.sourceId}" counts ${eligibleKey}, which was not retrieved by the query ` +
          `behind it. Nothing may be counted that nobody fetched.`,
      );
    }
  }
}

/**
 * Builds a `Measure`. This is the only way to make one.
 *
 * The order of the guards is the contract. A failed retrieval outranks every
 * other consideration because nothing ran at all; a stated blocker outranks
 * evaluation because the check never got to look; and an empty population
 * outranks a passing result because zero out of zero is not an all-clear.
 */
export function measure(input: MeasureInput): Measure {
  const provenance = buildProvenance(input);

  // M-1 — a failed retrieval poisons every figure derived from it, whatever the
  // caller believed it had computed.
  if (input.issueSet.record.failure !== null) {
    return {
      state: "unresolved",
      blocker: { kind: "retrieval-failed", failure: input.issueSet.record.failure },
      provenance,
    };
  }

  // A blocker the caller already knows about — an unmapped or ambiguous concept,
  // missing history — means evaluation never ran, so there is no result to show.
  if (input.blocker !== undefined) {
    return { state: "unresolved", blocker: input.blocker, provenance };
  }

  assertKeysAreWellFounded(input);

  // M-2 — the invariant that retires the three meanings of zero. An empty
  // population is reported as inapplicable, and is excluded from every
  // aggregate, so it can never be read as "all clear".
  if (input.eligibleKeys.length === 0) {
    return { state: "not-applicable", reason: NOTHING_IN_SCOPE_REASON, provenance };
  }

  return {
    state: "measured",
    flaggedKeys: input.flaggedKeys,
    eligibleKeys: input.eligibleKeys,
    // M-5 — inherited from the retrieval, never assigned by the caller, so a
    // figure drawn from an incomplete fetch always announces itself as a floor.
    isPartial: input.issueSet.record.isTruncated,
    provenance,
  };
}

/** How many issues a measured result flagged. Undefined for any other state. */
export function readFlaggedCount(subject: Measure): number | undefined {
  return subject.state === "measured" ? subject.flaggedKeys.length : undefined;
}

/** Whether this measure may contribute to an aggregate figure. */
export function canContributeToAggregate(subject: Measure): boolean {
  return subject.state === "measured";
}
