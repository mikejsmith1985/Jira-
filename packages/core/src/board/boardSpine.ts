// boardSpine.ts — The columns come from Jira, and only from Jira.
//
// A full search of the predecessor found ZERO calls to Jira's board
// configuration endpoint. Its roll-up board maintained its own column
// vocabulary — names, order, status mappings — per team, in browser storage and
// a Confluence property, reconciled against nothing. It was not a view of a Jira
// board at all.
//
// There is no vocabulary here. Jira publishes each board's columns and the
// statuses mapped to them; that IS the spine, and nothing in this product can
// create, rename, reorder or delete a column. A status belonging to no column
// lands in an explicit, visible column, because a board that hides work is worse
// than no board.

import type { JiraAdapter, JiraResponse } from "../jira/jiraAdapter.js";

/** The column that catches statuses the board maps nowhere. */
export const UNMAPPED_COLUMN_ID = "__not-on-this-board";

/** What that column is called on screen. */
export const UNMAPPED_COLUMN_NAME = "Not on this board";

/** One column, exactly as the board defines it. */
export interface SpineColumn {
  readonly columnId: string;
  readonly columnName: string;
  readonly statusIds: readonly string[];
  /** True for the catch-all column, which Jira did not define. */
  readonly isUnmappedColumn: boolean;
}

/** A board's own columns, read and never edited. */
export interface BoardSpine {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
  readonly columns: readonly SpineColumn[];
  readonly fetchedAtIso: string;
}

/** Why a board could not be read. */
export type BoardSpineFailure =
  | { readonly kind: "not-found"; readonly boardId: number }
  | { readonly kind: "permission"; readonly boardId: number }
  | { readonly kind: "transport"; readonly message: string };

/** The spine, or the reason there is none. */
export type BoardSpineResult =
  | { readonly status: "read"; readonly spine: BoardSpine }
  | { readonly status: "unavailable"; readonly failure: BoardSpineFailure; readonly reason: string };

/** Reads a nested property without throwing when a level is absent. */
function readNested(source: unknown, ...pathSegments: readonly string[]): unknown {
  let current: unknown = source;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Converts one raw column, keeping Jira's own name and its status mapping. */
function normaliseColumn(raw: Record<string, unknown>, index: number): SpineColumn {
  const rawStatuses = raw.statuses;
  const statusIds = Array.isArray(rawStatuses)
    ? rawStatuses.map((status) => String((status as Record<string, unknown>).id ?? ""))
    : [];

  return {
    // Jira does not give columns ids, so position supplies one. Two columns may
    // legitimately share a name, and a user choosing which to refine has to be
    // able to tell them apart.
    columnId: `col-${index}`,
    columnName: String(raw.name ?? `Column ${index + 1}`),
    statusIds,
    isUnmappedColumn: false,
  };
}

/** The catch-all column, appended so nothing can disappear. */
function buildUnmappedColumn(): SpineColumn {
  return {
    columnId: UNMAPPED_COLUMN_ID,
    columnName: UNMAPPED_COLUMN_NAME,
    statusIds: [],
    isUnmappedColumn: true,
  };
}

/** Turns a failed response into a reason a person can act on. */
function describeFailure(
  boardId: number,
  response: JiraResponse<unknown>,
): { failure: BoardSpineFailure; reason: string } {
  if (response.statusCode === 404) {
    return {
      failure: { kind: "not-found", boardId },
      reason: `Jira has no board ${boardId}, or it is not visible to you.`,
    };
  }

  if (response.statusCode === 401 || response.statusCode === 403) {
    return {
      failure: { kind: "permission", boardId },
      reason:
        `You cannot view board ${boardId}'s configuration. Reading it needs board-view rights, ` +
        `which is less than administration but more than nothing.`,
    };
  }

  return {
    failure: { kind: "transport", message: response.jiraMessages[0] ?? "" },
    reason:
      response.jiraMessages[0] ??
      `Jira answered with status ${response.statusCode} when asked for board ${boardId}.`,
  };
}

/**
 * Reads a board's columns from Jira.
 *
 * On failure this returns a reason and NO spine. There is deliberately no
 * fallback: substituting columns of our own would produce a board that looks
 * like the user's and is not, which is the exact deception this feature exists
 * to end.
 */
export async function fetchBoardSpine(
  boardId: number,
  adapter: JiraAdapter,
): Promise<BoardSpineResult> {
  const response = await adapter.fetchBoardConfiguration(boardId);

  if (response.statusCode !== 200 || response.body === null) {
    const described = describeFailure(boardId, response);
    return { status: "unavailable", ...described };
  }

  const raw = response.body as unknown as Record<string, unknown>;
  const rawColumns = readNested(raw, "columnConfig", "columns");
  const columns = Array.isArray(rawColumns)
    ? rawColumns.map((column, index) => normaliseColumn(column as Record<string, unknown>, index))
    : [];

  if (columns.length === 0) {
    return {
      status: "unavailable",
      failure: { kind: "transport", message: "no columns" },
      reason:
        `Board ${boardId} reported no columns. Jira+ renders a board's own columns and invents ` +
        `none, so there is nothing to draw.`,
    };
  }

  return {
    status: "read",
    spine: {
      boardId,
      boardName: String(raw.name ?? `Board ${boardId}`),
      boardType: String(raw.type ?? "unknown"),
      columns: [...columns, buildUnmappedColumn()],
      fetchedAtIso: new Date().toISOString(),
    },
  };
}

/**
 * Which column a status belongs to.
 *
 * Falls through to the catch-all rather than guessing a nearest match. A card in
 * roughly the right column is worse than one visibly in none, because the first
 * is wrong quietly.
 */
export function resolveColumnForStatus(spine: BoardSpine, statusId: string): SpineColumn {
  const match = spine.columns.find((column) => column.statusIds.includes(statusId));
  return match ?? spine.columns[spine.columns.length - 1] ?? buildUnmappedColumn();
}

/** Names duplicate column names, so a user choosing one can tell them apart. */
export function findDuplicateColumnNames(spine: BoardSpine): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const column of spine.columns) {
    if (seen.has(column.columnName)) duplicates.add(column.columnName);
    seen.add(column.columnName);
  }

  return [...duplicates];
}
