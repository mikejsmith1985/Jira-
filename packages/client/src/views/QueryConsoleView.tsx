// QueryConsoleView.tsx — Paste a query, see everything it matched.
//
// The first surface anyone meets, and useful before anything is configured. It
// exists to make one promise visible: what you see came from this exact query,
// at this exact time, and here it is to run yourself.
//
// A failed retrieval shows no table, no count and no score — only what Jira
// said. That absence is the feature.

import type { JSX } from "react";

import { useState } from "react";

import type { DetailedIssue } from "@jira-plus/core";

import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import type { IssueSetState } from "../state/useIssueSet.js";

/** Copies text, tolerating a browser that refuses clipboard access. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Nothing to recover: the query is on screen and selectable.
  }
}

/** One issue row. */
function IssueRow({ issue }: { readonly issue: DetailedIssue }): JSX.Element {
  const summary = String(issue.fields.get("summary") ?? "");
  return (
    <tr>
      <td className="mono">{issue.key}</td>
      <td className="issue-row__summary">{summary}</td>
      <td>{issue.issueTypeName}</td>
      <td>
        <span className="chip">{issue.statusName}</span>
      </td>
    </tr>
  );
}

/** What the console needs. */
export interface QueryConsoleViewProps {
  readonly issueSetState: IssueSetState;
}

/** The query console. */
export function QueryConsoleView({ issueSetState }: QueryConsoleViewProps): JSX.Element {
  const [draftJql, setDraftJql] = useState("");
  const [doesRequestAllFields, setDoesRequestAllFields] = useState(false);
  const { issueSet, isRetrieving, progress, run } = issueSetState;

  return (
    <section className="console">
      <h2 className="view__title">Ask anything about any set of issues</h2>
      <p className="view__lede">
        Paste a JQL query. Everything it matches is retrieved once, and every other screen reads
        from that one result.
      </p>

      <form
        className="console__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (draftJql.trim().length > 0) void run(draftJql.trim(), { doesRequestAllFields });
        }}
      >
        <label className="console__label" htmlFor="jql">
          JQL
        </label>
        <textarea
          id="jql"
          className="console__jql mono"
          rows={3}
          value={draftJql}
          spellCheck={false}
          placeholder="project = ENCUC AND sprint in openSprints() ORDER BY created DESC"
          onChange={(event) => setDraftJql(event.target.value)}
        />

        <div className="console__actions">
          <label className="console__toggle">
            <input
              type="checkbox"
              checked={doesRequestAllFields}
              onChange={(event) => setDoesRequestAllFields(event.target.checked)}
            />{" "}
            Fetch every field (slower, and much larger)
          </label>

          <button type="submit" className="button" disabled={isRetrieving || draftJql.trim().length === 0}>
            {isRetrieving ? "Retrieving…" : "Run"}
          </button>
        </div>
      </form>

      {isRetrieving && progress !== null ? (
        <p className="console__progress tabular">
          {progress.fetchedCount.toLocaleString()} of {progress.totalMatchingCount.toLocaleString()}{" "}
          retrieved so far…
        </p>
      ) : null}

      {issueSet === null ? null : (
        <>
          <ProvenanceBanner record={issueSet.record} onCopyQuery={copyToClipboard} />

          {/* No table, no count, no score when the query failed. There is
              nothing legitimate to show, so nothing is shown. */}
          {issueSet.record.failure !== null ? null : (
            <div className="console__results">
              {issueSet.issues.length === 0 ? (
                <p className="console__empty">
                  This query ran successfully and matched nothing. That is an answer, not a
                  failure — the query above is exactly what was asked.
                </p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Key</th>
                      <th scope="col">Summary</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issueSet.issues.map((issue) => (
                      <IssueRow key={issue.key} issue={issue} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
