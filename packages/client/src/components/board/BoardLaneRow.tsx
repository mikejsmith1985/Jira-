// BoardLaneRow.tsx — One Feature, across the board's columns.
//
// A lane's headline figure is computed over the whole lane, before any filter
// narrows what is drawn. Filtering the board should change what you can see, not
// what it claims.
//
// Where a column is refined, its bands are drawn INSIDE it, with a header saying
// which Jira column they divide and by what. That sentence is the difference
// between a lens over somebody's board and a replacement for it.

import type { JSX } from "react";

import { useState } from "react";

import { UNCLASSIFIED_BAND_ID, describeFamilyProgress } from "@jira-plus/core";
import type {
  BandedColumn,
  BoardLane,
  DetailedIssue,
  DisciplineRow,
  FamilyProgress,
} from "@jira-plus/core";

import { BoardCard } from "./BoardCard.js";
import { DisciplineSubLane } from "./DisciplineSubLane.js";

/** What one lane needs. */
export interface BoardLaneRowProps {
  readonly lane: BoardLane;
  readonly markersByIssueKey: ReadonlyMap<string, readonly string[]>;
  readonly jiraBaseUrl: string;
  /** QE's and BT's work beneath this Feature, when any was found. */
  readonly disciplineRows?: readonly DisciplineRow[];
  /** The two figures, dev-only and whole-family, never blended. */
  readonly familyProgress?: FamilyProgress;
}

/** Renders one column's cards, banded where a refinement says so. */
function ColumnCell({
  column,
  markersByIssueKey,
  jiraBaseUrl,
}: {
  readonly column: BandedColumn;
  readonly markersByIssueKey: ReadonlyMap<string, readonly string[]>;
  readonly jiraBaseUrl: string;
}): JSX.Element {
  const renderCard = (issue: DetailedIssue): JSX.Element => (
    <BoardCard
      key={issue.key}
      issue={issue}
      markers={markersByIssueKey.get(issue.key) ?? []}
      jiraBaseUrl={jiraBaseUrl}
    />
  );

  return (
    <div className="board__cell" role="cell">
      {column.unrefinedReason === null ? null : (
        <p className="board__unrefined">{column.unrefinedReason}</p>
      )}

      {column.bands.length === 0
        ? column.issues.map(renderCard)
        : column.bands.map((band) => (
            <div
              key={band.bandId}
              className={`board__band ${band.isUnclassified ? "board__band--unclassified" : ""}`}
            >
              <p className="board__band-label">
                {band.label}
                <span className="board__band-count tabular"> {band.issues.length}</span>
              </p>
              {band.issues.map(renderCard)}
            </div>
          ))}
    </div>
  );
}

/** One Feature lane. */
export function BoardLaneRow({
  lane,
  markersByIssueKey,
  jiraBaseUrl,
  disciplineRows = [],
  familyProgress,
}: BoardLaneRowProps): JSX.Element {
  const [expandedDisciplineId, setExpandedDisciplineId] = useState<string | null>(null);

  // With disciplines present the pair is shown, never a blended figure: a lane
  // at 60% would leave a reader unable to say whether dev is finished and QE has
  // not started, or the reverse.
  const progress =
    familyProgress !== undefined
      ? describeFamilyProgress(familyProgress)
      : lane.progress.state === "measured"
        ? `${lane.progress.flaggedKeys.length} of ${lane.progress.eligibleKeys.length} done`
        : "nothing to measure";

  return (
    <div className="board__lane" role="row">
      <div className="board__lane-heading">
        <p className="board__lane-name">{lane.laneName}</p>
        <p className="board__lane-progress tabular">{progress}</p>
        {lane.hasNoWork ? (
          <p className="board__lane-note">No work beneath this Feature in scope.</p>
        ) : null}
        {lane.progress.state === "measured" && lane.progress.isPartial ? (
          <p className="board__lane-note">At least — the retrieval was incomplete.</p>
        ) : null}

        {/* Discipline is rows inside the lane, not a second axis across the
            board — which keeps one readable axis. Collapsed by default, so the
            board looks exactly like the board without them. */}
        {disciplineRows.map((row) => (
          <DisciplineSubLane
            key={row.disciplineId}
            row={row}
            jiraBaseUrl={jiraBaseUrl}
            isExpanded={expandedDisciplineId === row.disciplineId}
            onToggle={() =>
              setExpandedDisciplineId((current) =>
                current === row.disciplineId ? null : row.disciplineId,
              )
            }
          />
        ))}
      </div>

      {lane.columns.map((column) => (
        <ColumnCell
          key={column.columnId}
          column={column}
          markersByIssueKey={markersByIssueKey}
          jiraBaseUrl={jiraBaseUrl}
        />
      ))}
    </div>
  );
}

export { UNCLASSIFIED_BAND_ID };
