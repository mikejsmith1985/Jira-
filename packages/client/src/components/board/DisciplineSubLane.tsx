// DisciplineSubLane.tsx — QE's and BT's work, in their own terms.
//
// Rendered as rows INSIDE a Feature lane rather than as a second axis across the
// board. That keeps one readable axis, which is what the two-axis swimlane board
// could not manage — and discipline is a small number of rows, not another
// dimension.
//
// Read-only, always. Their sprints, their workflow, their board. Nothing here
// offers a drag, and nothing forces their work into the dev team's column names:
// where their board could not be read, this falls back to Jira's own three
// states and says so, because pretending to know their columns would be the
// same lie as the parallel vocabulary this design removed.

import type { JSX } from "react";

import { buildJiraBrowseUrl, toCoarseState } from "@jira-plus/core";
import type { DisciplineRow } from "@jira-plus/core";

/** The three coarse states, in the order work moves through them. */
const COARSE_STATES = ["not started", "in progress", "done"] as const;

/** What one discipline row needs. */
export interface DisciplineSubLaneProps {
  readonly row: DisciplineRow;
  readonly jiraBaseUrl: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

/** One discipline's work beneath a Feature. */
export function DisciplineSubLane({
  row,
  jiraBaseUrl,
  isExpanded,
  onToggle,
}: DisciplineSubLaneProps): JSX.Element {
  const progress =
    row.progress.state === "measured"
      ? `${row.progress.flaggedKeys.length}/${row.progress.eligibleKeys.length}`
      : "—";

  const countsByState = new Map(
    COARSE_STATES.map((state) => [
      state,
      row.issues.filter((issue) => toCoarseState(issue) === state).length,
    ]),
  );

  return (
    <div className="sublane">
      <button
        type="button"
        className="sublane__summary"
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span className="sublane__label">{row.label}</span>
        <span className="sublane__progress tabular">{progress}</span>
        <span className="chip chip--na">read-only</span>
        {row.view.mode === "coarse-three-state" ? (
          <span className="sublane__note">coarse view</span>
        ) : (
          <span className="sublane__note">{row.view.boardName}</span>
        )}
      </button>

      {isExpanded ? (
        <div className="sublane__body">
          {row.view.mode === "coarse-three-state" ? (
            <p className="sublane__reason">
              {row.view.reason} Showing Jira&apos;s own three states rather than guessing at{" "}
              {row.label}&apos;s columns.
            </p>
          ) : (
            <p className="sublane__reason">
              Shown in {row.label}&apos;s own columns, from {row.view.boardName}.
            </p>
          )}

          <div className="sublane__states">
            {COARSE_STATES.map((state) => (
              <div key={state} className="sublane__state">
                <p className="sublane__state-label">
                  {state}
                  <span className="tabular"> {countsByState.get(state) ?? 0}</span>
                </p>
                <ul className="sublane__keys">
                  {row.issues
                    .filter((issue) => toCoarseState(issue) === state)
                    .map((issue) => (
                      <li key={issue.key} className="mono">
                        {jiraBaseUrl.length > 0 ? (
                          <a
                            href={buildJiraBrowseUrl(jiraBaseUrl, issue.key)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {issue.key}
                          </a>
                        ) : (
                          issue.key
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="sublane__reason">
            {row.label}&apos;s sprints are not considered. This is Feature-scoped, so their sprint
            boundaries have no bearing on whether their work supporting this Feature is done.
          </p>
        </div>
      ) : null}
    </div>
  );
}
