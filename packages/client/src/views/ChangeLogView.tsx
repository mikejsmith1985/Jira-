// ChangeLogView.tsx — What did this tool do to my board?
//
// A person is entitled to ask that of anything that writes to their backlog,
// and this is the answer. Read-only: there is no route that clears or edits the
// record, deliberately, because a log somebody can tidy is not evidence.

import type { JSX } from "react";

import { useEffect, useState } from "react";

/** One recorded change, as the server stores it. */
interface JournalEntry {
  readonly entryId: string;
  readonly atIso: string;
  readonly method: string;
  readonly action: string;
  readonly issueKey: string | null;
  readonly outcome: "attempted" | "applied" | "failed";
  readonly statusCode?: number;
}

/** Plain-English names for what a change did. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  transition: "Moved status",
  comment: "Added a comment",
  worklog: "Logged work",
  link: "Linked issues",
  field: "Changed a field",
  create: "Created an issue",
  other: "Other change",
};

/** The change log. */
export function ChangeLogView(): JSX.Element {
  const [entries, setEntries] = useState<readonly JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isStillMounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/write-journal");
        const body = await response.json();
        if (isStillMounted) setEntries(body.entries ?? []);
      } catch (error) {
        if (isStillMounted) {
          setErrorMessage(error instanceof Error ? error.message : "The log could not be read.");
        }
      } finally {
        if (isStillMounted) setIsLoading(false);
      }
    })();
    return () => {
      isStillMounted = false;
    };
  }, []);

  return (
    <section>
      <h2 className="view__title">Everything Jira+ changed</h2>
      <p className="view__lede">
        Every write passes through one route, and that route records it. Nothing can reach Jira
        without appearing here.
      </p>

      {errorMessage === null ? null : <p className="notice notice--error">{errorMessage}</p>}

      {isLoading ? <p>Reading the log…</p> : null}

      {!isLoading && entries.length === 0 ? (
        <p className="console__empty">
          Jira+ has not changed anything yet. This is empty because nothing has happened, not
          because nothing was recorded.
        </p>
      ) : null}

      {entries.length === 0 ? null : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Issue</th>
              <th scope="col">What</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.entryId}>
                <td>{new Date(entry.atIso).toLocaleString()}</td>
                <td className="mono">{entry.issueKey ?? "—"}</td>
                <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td>
                  <span className={`chip chip--${entry.outcome}`}>
                    {entry.outcome}
                    {entry.statusCode === undefined ? "" : ` (${entry.statusCode})`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
