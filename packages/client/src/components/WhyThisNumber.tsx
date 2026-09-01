// WhyThisNumber.tsx — "Where did this come from?", answered without leaving the view.
//
// Every figure carries its provenance, and this is where that provenance is
// read. It shows the exact query, when it ran, how much of the result it saw,
// the configuration in force, and — for a check — which Jira field each concept
// actually resolved to, with Jira's own label for it.
//
// That last part is what makes a mapping auditable rather than merely
// configured. The predecessor bound a check to the wrong field and reported
// clean zeros for months; nothing on any screen said which field had been
// picked.

import type { JSX } from "react";

import type { Measure } from "@jira-plus/core";

/** One concept and the Jira field it resolved to, for display. */
export interface ResolvedFieldNote {
  readonly conceptLabel: string;
  readonly fieldId: string;
  readonly jiraName: string;
}

/** What the panel needs. */
export interface WhyThisNumberProps {
  readonly measure: Measure;
  readonly resolvedFields?: readonly ResolvedFieldNote[];
  readonly onCopyQuery?: (jql: string) => void;
}

/** Renders the provenance behind one figure. */
export function WhyThisNumber({
  measure,
  resolvedFields = [],
  onCopyQuery,
}: WhyThisNumberProps): JSX.Element {
  const { record, workspaceFingerprint, lensId } = measure.provenance;

  return (
    <section className="why">
      <h4 className="why__title">Where this number came from</h4>

      <dl className="why__list">
        <dt>Query</dt>
        <dd>
          <code className="why__jql">{record.jql}</code>
          {onCopyQuery ? (
            <button type="button" className="why__copy" onClick={() => onCopyQuery(record.jql)}>
              Copy
            </button>
          ) : null}
        </dd>

        <dt>Retrieved</dt>
        <dd className="tabular">
          {record.fetchedCount.toLocaleString()} of {record.totalMatchingCount.toLocaleString()}
          {record.isTruncated ? " — incomplete, so this figure is a floor" : " — complete"}
        </dd>

        <dt>Ran at</dt>
        <dd>{new Date(record.startedAtIso).toLocaleString()}</dd>

        <dt>Configuration</dt>
        <dd className="mono">{workspaceFingerprint}</dd>

        {lensId === undefined ? null : (
          <>
            <dt>Counting as finished</dt>
            <dd>{lensId}</dd>
          </>
        )}

        {resolvedFields.length === 0 ? null : (
          <>
            <dt>Fields read</dt>
            <dd>
              <ul className="why__fields">
                {resolvedFields.map((field) => (
                  <li key={field.fieldId}>
                    {field.conceptLabel} →{" "}
                    <span className="mono">{field.fieldId}</span> (
                    {field.jiraName}, as Jira names it)
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {measure.state === "measured" ? (
        <p className="why__note">
          The number shown is the length of the list behind it. They are the same list, so they
          cannot disagree.
        </p>
      ) : null}
    </section>
  );
}
