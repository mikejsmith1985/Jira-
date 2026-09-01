// BoardView.tsx — Your board, with Feature swimlanes over it.
//
// The columns are Jira's own: same names, same order, same status mappings.
// There is no way to create, rename or reorder one, because there is no
// vocabulary here to maintain. What Jira columns cannot express — a sub-status
// distinction, an open code-review sub-task — is added as a visible refinement
// INSIDE a column, never as a column of its own.
//
// One column row across the top, Features as lanes down the side. One readable
// axis, which is what the two-axis swimlane board could not manage.

import type { JSX } from "react";

import { useEffect, useMemo, useState } from "react";

import {
  assertEveryIssueAppearsOnce,
  buildBoardLayout,
  hasCardMarker,
  validateRefinements,
} from "@jira-plus/core";
import type { CardMarker, ColumnRefinement, WorkspaceConfiguration } from "@jira-plus/core";

import { BoardLaneRow } from "../components/board/BoardLaneRow.js";
import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import type { BoardState } from "../state/useBoard.js";

/** What the board surface needs. */
export interface BoardViewProps {
  readonly boardState: BoardState;
  readonly configuration: WorkspaceConfiguration | null;
  readonly refinements: readonly ColumnRefinement[];
  readonly cardMarkers: readonly CardMarker[];
  readonly jiraBaseUrl: string;
}

/** The board surface. */
export function BoardView({
  boardState,
  configuration,
  refinements,
  cardMarkers,
  jiraBaseUrl,
}: BoardViewProps): JSX.Element {
  const [boardIdDraft, setBoardIdDraft] = useState("");
  const { spineResult, issueSet, childIssues, isLoading, errorMessage, load } = boardState;

  const validation = useMemo(() => {
    if (spineResult?.status !== "read" || configuration === null) return null;
    return validateRefinements(spineResult.spine, refinements, configuration.fieldMap);
  }, [spineResult, refinements, configuration]);

  const layout = useMemo(() => {
    if (spineResult?.status !== "read" || issueSet === null || configuration === null) return null;

    const staleColumnNames = new Set(
      (validation?.staleRefinements ?? []).map((stale) => stale.refinesColumnName),
    );

    const built = buildBoardLayout({
      issueSet,
      spine: spineResult.spine,
      refinements,
      fieldMap: configuration.fieldMap,
      staleColumnNames,
    });

    // The likeliest bug on a board of this shape is a card drawn twice or not at
    // all, and neither is visible by looking.
    assertEveryIssueAppearsOnce(built, issueSet);
    return built;
  }, [spineResult, issueSet, configuration, refinements, validation]);

  /** Which markers a card carries, from its open children. */
  const markersByIssueKey = useMemo(() => {
    const markers = new Map<string, string[]>();
    if (issueSet === null) return markers;

    for (const issue of issueSet.issues) {
      const raised = cardMarkers
        .filter((marker) => hasCardMarker(issue, childIssues, marker))
        .map((marker) => marker.label);
      if (raised.length > 0) markers.set(issue.key, raised);
    }
    return markers;
  }, [issueSet, childIssues, cardMarkers]);

  useEffect(() => {
    const savedBoardId = window.localStorage.getItem("jiraPlusLastBoardId");
    if (savedBoardId !== null) setBoardIdDraft(savedBoardId);
  }, []);

  return (
    <section>
      <h2 className="view__title">Your board, whole</h2>
      <p className="view__lede">
        The columns below are your Jira board&apos;s own — same names, same order. There is nothing
        here to configure and nothing to keep in step.
      </p>

      <form
        className="console__actions"
        onSubmit={(event) => {
          event.preventDefault();
          const boardId = Number(boardIdDraft);
          if (Number.isFinite(boardId) && boardId > 0) {
            window.localStorage.setItem("jiraPlusLastBoardId", String(boardId));
            void load(boardId);
          }
        }}
      >
        <input
          className="console__jql mono"
          value={boardIdDraft}
          placeholder="Board id, e.g. 42"
          aria-label="Jira board id"
          onChange={(event) => setBoardIdDraft(event.target.value)}
        />
        <button type="submit" className="button" disabled={isLoading}>
          {isLoading ? "Reading…" : "Read this board"}
        </button>
      </form>

      {errorMessage === null ? null : (
        <p className="notice notice--error" role="alert">
          {errorMessage}
        </p>
      )}

      {spineResult?.status === "unavailable" ? (
        <div className="notice notice--error" role="alert">
          <p>{spineResult.reason}</p>
          <p>
            No board is drawn. Jira+ renders your board&apos;s own columns and invents none, so
            there is nothing to show.
          </p>
        </div>
      ) : null}

      {validation !== null && validation.staleRefinements.length > 0 ? (
        <div className="notice" role="alert">
          <p>
            {validation.staleRefinements.length} refinement
            {validation.staleRefinements.length === 1 ? "" : "s"} refer to a column this board no
            longer has:{" "}
            {validation.staleRefinements.map((stale) => `"${stale.refinesColumnName}"`).join(", ")}.
            Those columns are shown unrefined, with every card still in them.
          </p>
        </div>
      ) : null}

      {spineResult?.status === "read" && issueSet !== null && layout !== null ? (
        <>
          <ProvenanceBanner record={issueSet.record} />

          <p className="def-line">
            Columns from <strong>{spineResult.spine.boardName}</strong> (board{" "}
            {spineResult.spine.boardId}), as Jira has them. Read{" "}
            {new Date(spineResult.spine.fetchedAtIso).toLocaleString()}.
          </p>

          {layout.incompleteNotice === null ? null : (
            <p className="notice">{layout.incompleteNotice}</p>
          )}

          <div className="board">
            <div className="board__header" role="row">
              <div className="board__lane-heading">Feature</div>
              {spineResult.spine.columns.map((column) => (
                <div key={column.columnId} className="board__column-heading">
                  {column.columnName}
                </div>
              ))}
            </div>

            {layout.lanes.map((lane) => (
              <BoardLaneRow
                key={lane.laneId}
                lane={lane}
                markersByIssueKey={markersByIssueKey}
                jiraBaseUrl={jiraBaseUrl}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
