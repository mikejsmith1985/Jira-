// issueSet.ts — A frozen snapshot of one query's results, and the account of how
// it came to exist.
//
// Every feature in Jira+ is a pure function over one of these. No feature issues
// a query of its own, which is the single restriction that makes the
// predecessor's defining defect impossible: a broken query cannot quietly become
// a green score, because there is no second query left to go wrong.
//
// Truncation and failure are derived here rather than accepted from a caller.
// A caller who forgets to set a flag is exactly the failure this file exists to
// rule out.

import type { DetailedIssue } from "./detailedIssue.js";

/** Whether the change history was requested, and whether it all arrived. */
export type ChangelogCoverage = "none" | "partial" | "full";

/**
 * Why a retrieval produced nothing.
 *
 * Four kinds, because each demands something different of the reader. A
 * permission problem displayed as an empty backlog is the specific mistake this
 * union exists to prevent.
 */
export type RetrievalFailure =
  | { readonly kind: "jql-error"; readonly jiraMessages: readonly string[] }
  // Jira+ refused to forward, because setup is unfinished. Distinct from
  // every other kind because Jira was never asked: presenting this as a Jira
  // failure sends somebody to hunt an outage that does not exist.
  | { readonly kind: "not-configured" }
  | { readonly kind: "authentication" }
  | { readonly kind: "permission"; readonly projectKeys: readonly string[] }
  | { readonly kind: "transport"; readonly message: string; readonly retryAfterSeconds?: number };

/** Everything needed to answer "where did this number come from?". */
export interface RetrievalRecord {
  readonly issueSetId: string;
  readonly jql: string;
  readonly fieldsRequested: readonly string[];
  readonly expandRequested: readonly string[];
  readonly startedAtIso: string;
  readonly durationMs: number;
  readonly totalMatchingCount: number;
  readonly fetchedCount: number;
  readonly isTruncated: boolean;
  readonly ceiling: number;
  readonly changelogCoverage: ChangelogCoverage;
  readonly workspaceFingerprint: string;
  readonly failure: RetrievalFailure | null;
}

/** What the caller supplies; `isTruncated` and `issueSetId` are derived, not given. */
export type RetrievalRecordInput = Omit<RetrievalRecord, "issueSetId" | "isTruncated">;

/** Whether the retrieval finished, stopped at the ceiling, or never ran. */
export type IssueSetState = "complete" | "truncated" | "failed";

/** One query's results, frozen. Never modified after construction. */
export interface IssueSet {
  readonly state: IssueSetState;
  readonly record: RetrievalRecord;
  readonly issues: readonly DetailedIssue[];
  readonly byKey: ReadonlyMap<string, DetailedIssue>;
}

/** Counter backing the per-retrieval identifier, so two records never collide. */
let retrievalSequence = 0;

/** A short identifier unique within this process run. */
function nextIssueSetId(): string {
  retrievalSequence += 1;
  return `set-${Date.now().toString(36)}-${retrievalSequence.toString(36)}`;
}

/**
 * Builds the provenance record for one retrieval.
 *
 * Truncation is computed from Jira's own reported total against what was
 * actually fetched. Reaching the ceiling at exactly the true total is not
 * truncation, and must not be reported as such — a false truncation warning
 * teaches readers to ignore the real one.
 */
export function buildRetrievalRecord(input: RetrievalRecordInput): RetrievalRecord {
  if (input.fetchedCount > input.totalMatchingCount) {
    throw new Error(
      `Retrieval claims ${input.fetchedCount} issues, which is more issues than Jira reported ` +
        `(${input.totalMatchingCount}). One of the two counts is wrong.`,
    );
  }

  return {
    ...input,
    issueSetId: nextIssueSetId(),
    isTruncated: input.totalMatchingCount > input.fetchedCount,
  };
}

/** Derives the set's state from its record. There is no independent flag to disagree with. */
function resolveState(record: RetrievalRecord): IssueSetState {
  if (record.failure !== null) return "failed";
  return record.isTruncated ? "truncated" : "complete";
}

/** Indexes issues by key, refusing duplicates rather than silently dropping one. */
function indexByKey(issues: readonly DetailedIssue[]): ReadonlyMap<string, DetailedIssue> {
  const index = new Map<string, DetailedIssue>();
  for (const issue of issues) {
    if (index.has(issue.key)) {
      throw new Error(
        `Duplicate issue key ${issue.key} in one retrieval. Keeping either copy would make ` +
          `every count that follows unverifiable.`,
      );
    }
    index.set(issue.key, issue);
  }
  return index;
}

/**
 * Freezes one retrieval into the snapshot every lens consumes.
 *
 * A failed retrieval carries no issues: there is nothing legitimate to compute
 * over, and allowing issues alongside a failure would let a partial result be
 * presented as an answer.
 */
export function buildIssueSet(
  record: RetrievalRecord,
  issues: readonly DetailedIssue[],
): IssueSet {
  if (record.failure !== null && issues.length > 0) {
    throw new Error(
      `A failed retrieval cannot carry ${issues.length} issues. Nothing may be computed over the ` +
        `results of a query that did not run.`,
    );
  }

  return {
    state: resolveState(record),
    record,
    issues,
    byKey: indexByKey(issues),
  };
}
