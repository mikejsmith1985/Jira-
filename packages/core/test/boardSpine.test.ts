// boardSpine.test.ts — The columns are Jira's, and there is no way to make others.
//
// The premise of this whole feature. The predecessor maintained its own column
// vocabulary and reconciled it against nothing; a search of that codebase found
// zero calls to the endpoint these tests exercise.
//
// The load-bearing assertion is the failure case: when a board cannot be read,
// there is no spine and no fallback. Substituting columns of our own would draw
// something that looks like the user's board and is not.

import { describe, expect, it, vi } from "vitest";

import {
  UNMAPPED_COLUMN_ID,
  fetchBoardSpine,
  findDuplicateColumnNames,
  resolveColumnForStatus,
} from "../src/board/boardSpine.js";
import type { JiraAdapter } from "../src/jira/jiraAdapter.js";

/** An adapter answering with the given board configuration. */
function buildAdapter(statusCode: number, body: unknown, jiraMessages: readonly string[] = []) {
  return {
    fetchBoardConfiguration: vi.fn(async () => ({
      statusCode,
      body,
      jiraMessages,
      retryAfterSeconds: null,
    })),
  } as unknown as JiraAdapter;
}

/** A board configuration as Jira returns it. */
function buildConfiguration() {
  return {
    id: 42,
    name: "ENCUC Delivery",
    type: "kanban",
    columnConfig: {
      columns: [
        { name: "To Do", statuses: [{ id: "1" }] },
        { name: "In Progress", statuses: [{ id: "3" }, { id: "10001" }] },
        { name: "Testing", statuses: [{ id: "10002" }] },
        { name: "Done", statuses: [{ id: "6" }] },
      ],
    },
  };
}

describe("the columns come from Jira", () => {
  it("uses the board's own names, in the board's own order", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, buildConfiguration()));

    expect(result.status).toBe("read");
    if (result.status !== "read") return;
    expect(result.spine.columns.slice(0, 4).map((column) => column.columnName)).toEqual([
      "To Do",
      "In Progress",
      "Testing",
      "Done",
    ]);
  });

  it("keeps the status mapping the board defines", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, buildConfiguration()));
    if (result.status !== "read") return;

    expect(result.spine.columns[1]?.statusIds).toEqual(["3", "10001"]);
  });

  it("names the board, so a reader knows which one they are looking at", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, buildConfiguration()));
    if (result.status !== "read") return;

    expect(result.spine.boardName).toBe("ENCUC Delivery");
  });
});

describe("a status the board maps nowhere", () => {
  it("lands in a visible column rather than disappearing", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, buildConfiguration()));
    if (result.status !== "read") return;

    const column = resolveColumnForStatus(result.spine, "99999");

    expect(column.columnId).toBe(UNMAPPED_COLUMN_ID);
    expect(column.isUnmappedColumn).toBe(true);
  });

  it("does not guess a nearest column", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, buildConfiguration()));
    if (result.status !== "read") return;

    // A card in roughly the right column is worse than one visibly in none,
    // because the first is wrong quietly.
    expect(resolveColumnForStatus(result.spine, "99999").columnName).not.toBe("In Progress");
  });

  it("places a mapped status in its own column", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, buildConfiguration()));
    if (result.status !== "read") return;

    expect(resolveColumnForStatus(result.spine, "10002").columnName).toBe("Testing");
  });
});

describe("when the board cannot be read", () => {
  it("reports a missing board rather than inventing columns", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(404, null));

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.failure.kind).toBe("not-found");
  });

  it("distinguishes a permission problem, and says what rights are needed", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(403, null));
    if (result.status !== "unavailable") return;

    expect(result.failure.kind).toBe("permission");
    expect(result.reason).toMatch(/board-view rights/i);
  });

  it("refuses a board reporting no columns rather than drawing nothing quietly", async () => {
    const result = await fetchBoardSpine(42, buildAdapter(200, { name: "Empty", columnConfig: { columns: [] } }));

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toMatch(/invents none/i);
  });

  it("never returns a spine alongside a failure", async () => {
    for (const statusCode of [401, 403, 404, 500]) {
      const result = await fetchBoardSpine(42, buildAdapter(statusCode, null));
      expect(result.status).toBe("unavailable");
    }
  });
});

describe("two columns with the same name", () => {
  it("gives them distinct ids, so a user can tell them apart when choosing one", async () => {
    const configuration = buildConfiguration();
    configuration.columnConfig.columns.push({ name: "Testing", statuses: [{ id: "10003" }] });

    const result = await fetchBoardSpine(42, buildAdapter(200, configuration));
    if (result.status !== "read") return;

    const testingColumns = result.spine.columns.filter((column) => column.columnName === "Testing");

    expect(testingColumns).toHaveLength(2);
    expect(testingColumns[0]?.columnId).not.toBe(testingColumns[1]?.columnId);
  });

  it("reports the duplication, because a refinement must name one of them", async () => {
    const configuration = buildConfiguration();
    configuration.columnConfig.columns.push({ name: "Testing", statuses: [{ id: "10003" }] });

    const result = await fetchBoardSpine(42, buildAdapter(200, configuration));
    if (result.status !== "read") return;

    expect(findDuplicateColumnNames(result.spine)).toEqual(["Testing"]);
  });
});
