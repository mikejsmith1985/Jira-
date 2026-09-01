// ProvenanceBanner.tsx — The receipt that appears on every surface.
//
// It states what was retrieved, when, from which query, and under which
// configuration — and hands the query back so the user can run it in Jira
// themselves. That offer is the product's central claim, so the query is
// reproduced exactly as it was sent rather than re-rendered from parts.
//
// Three states, and the failing one shows no counts at all: a banner that
// reported "0 of 0 retrieved" beside an error would invite exactly the reading
// this whole design exists to prevent.

import type { JSX } from "react";

import type { RetrievalFailure, RetrievalRecord } from "@jira-plus/core";

/** Turns a failure into a sentence plus the action it calls for. */
function describeFailure(failure: RetrievalFailure): { headline: string; detail: string } {
  switch (failure.kind) {
    case "jql-error":
      return {
        headline: "Jira rejected this query. Nothing was retrieved.",
        detail: failure.jiraMessages.join(" "),
      };
    case "authentication":
      return {
        headline: "Jira did not accept the credential.",
        detail: "The personal access token may have expired. Add a new one in setup.",
      };
    case "permission":
      return {
        headline: "Some projects in this query could not be read.",
        detail:
          failure.projectKeys.length > 0
            ? `No access to: ${failure.projectKeys.join(", ")}. This is not an empty backlog.`
            : "Your account cannot browse part of this scope. This is not an empty backlog.",
      };
    case "transport":
      return {
        headline: "The request to Jira did not complete.",
        detail:
          failure.retryAfterSeconds === undefined
            ? failure.message
            : `${failure.message} Retry in ${failure.retryAfterSeconds} seconds.`,
      };
  }
}

/** Formats a timestamp for reading rather than for parsing. */
function formatMoment(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  return Number.isNaN(parsed.getTime()) ? isoTimestamp : parsed.toLocaleString();
}

/** What the banner needs. */
export interface ProvenanceBannerProps {
  readonly record: RetrievalRecord;
  readonly onCopyQuery?: (jql: string) => void;
}

/** Renders the receipt for one retrieval. */
export function ProvenanceBanner({ record, onCopyQuery }: ProvenanceBannerProps): JSX.Element {
  if (record.failure !== null) {
    const { headline, detail } = describeFailure(record.failure);
    return (
      <section className="receipt receipt--failed" role="alert">
        <p className="receipt__headline">{headline}</p>
        <p className="receipt__detail mono">{detail}</p>
        <p className="receipt__note">
          No count, chart or score is shown, because there is nothing to count.
        </p>
      </section>
    );
  }

  const completeness = record.isTruncated
    ? `${record.fetchedCount.toLocaleString()} of ${record.totalMatchingCount.toLocaleString()} retrieved — incomplete`
    : `${record.fetchedCount.toLocaleString()} of ${record.totalMatchingCount.toLocaleString()} retrieved — complete`;

  return (
    <section className={`receipt ${record.isTruncated ? "receipt--partial" : "receipt--complete"}`}>
      <span className="receipt__lead tabular">{completeness}</span>
      <span className="receipt__item">{formatMoment(record.startedAtIso)}</span>
      <span className="receipt__item">
        {record.changelogCoverage === "none" ? "history not requested" : `history ${record.changelogCoverage}`}
      </span>
      <span className="receipt__item mono">config {record.workspaceFingerprint}</span>

      {onCopyQuery ? (
        <button type="button" className="receipt__copy" onClick={() => onCopyQuery(record.jql)}>
          Copy query
        </button>
      ) : null}

      {record.isTruncated ? (
        <p className="receipt__note">
          Every figure from this retrieval is a floor, not a total. Raise the retrieval limit or
          narrow the query to see all of it.
        </p>
      ) : null}
    </section>
  );
}
