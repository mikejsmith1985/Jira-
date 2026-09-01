// planStatusMove.test.ts — Decide first, send second, and never lie about it.
//
// Two behaviours carry this. A move Jira will refuse is refused here with no
// request sent, because discovering it by watching a card jump back is a worse
// way to learn a workflow rule — and it leaves a failed write in the log for
// something the user could not have done.
//
// And when a two-part move half-succeeds, the card does NOT snap back. Jira
// performed the transition, so the card's new position is the truth. Reverting
// it would show a state Jira does not hold, purely to make the interface look
// tidy.

import { describe, expect, it, vi } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import type { FieldMap } from "../src/workspace/workspaceConfig.js";
import { executeStatusMove, planStatusMove } from "../src/board/planStatusMove.js";
import type { JiraAdapter, TransitionDescriptor } from "../src/jira/jiraAdapter.js";

/** The sub-status field on this fictional instance. */
const SUB_STATUS_FIELD = "customfield_10500";

/** A field map with the band's concept confirmed. */
function buildFieldMap(): FieldMap {
  const base = buildDefaultWorkspaceConfiguration().fieldMap;
  return {
    ...base,
    programIncrement: {
      state: "resolved",
      fieldId: SUB_STATUS_FIELD,
      jiraName: "Test Stage",
      matchedBy: "exact-name",
      confirmedAtIso: "2026-09-01T00:00:00.000Z",
    },
  };
}

/** One issue in a known status and band. */
function buildIssue(statusId: string, statusName: string, subStatus?: string) {
  const fields: Record<string, unknown> = {
    summary: "Work",
    issuetype: { name: "Story" },
    status: { id: statusId, name: statusName, statusCategory: { key: "indeterminate" } },
  };
  if (subStatus !== undefined) fields[SUB_STATUS_FIELD] = subStatus;
  return normaliseRawIssue({ id: "ENCUC-1", key: "ENCUC-1", fields }, {});
}

/** An adapter offering the given transitions. */
function buildAdapter(transitions: readonly TransitionDescriptor[], statusCode = 200) {
  return {
    fetchTransitions: vi.fn(async () => ({
      statusCode,
      body: statusCode === 200 ? transitions : null,
      jiraMessages: statusCode === 200 ? [] : ["You do not have permission"],
      retryAfterSeconds: null,
    })),
  } as unknown as JiraAdapter;
}

/** A transition to a named status. */
function buildTransition(toStatusName: string, requiredFieldIds: readonly string[] = []) {
  return { transitionId: "31", name: `Move to ${toStatusName}`, toStatusName, requiredFieldIds };
}

describe("nothing to do", () => {
  it("recognises a drop into the column and band the card already occupies", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("10002", "Testing", "QE"),
      target: {
        columnName: "Testing",
        targetStatusId: "10002",
        targetStatusName: "Testing",
        bandConcept: "programIncrement",
        bandValue: "QE",
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([]),
    });

    expect(plan.kind).toBe("no-op");
  });

  it("sends nothing for a no-op, so the log records no write that did not happen", async () => {
    const writeField = vi.fn();
    const applyTransition = vi.fn();

    const outcome = await executeStatusMove(
      { kind: "no-op", reason: "already there" },
      "ENCUC-1",
      buildAdapter([]),
      writeField,
      applyTransition,
    );

    expect(outcome.kind).toBe("nothing-to-do");
    expect(writeField).not.toHaveBeenCalled();
    expect(applyTransition).not.toHaveBeenCalled();
  });
});

describe("a move Jira will not perform", () => {
  it("is refused without a request being sent", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("1", "To Do"),
      target: {
        columnName: "Done",
        targetStatusId: "6",
        targetStatusName: "Done",
        bandConcept: null,
        bandValue: null,
      },
      fieldMap: buildFieldMap(),
      // Jira offers only a move to In Progress from here.
      adapter: buildAdapter([buildTransition("In Progress")]),
    });

    expect(plan.kind).toBe("refused");
    expect(plan.kind === "refused" && plan.reason).toMatch(/has not moved/i);
  });

  it("refuses when the target column maps to more than one status", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("1", "To Do"),
      target: {
        columnName: "In Progress",
        targetStatusId: null,
        targetStatusName: null,
        bandConcept: null,
        bandValue: null,
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([]),
    });

    expect(plan.kind).toBe("refused");
    expect(plan.kind === "refused" && plan.reason).toMatch(/more than one status/i);
  });

  it("refuses when Jira will not say which transitions exist", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("1", "To Do"),
      target: {
        columnName: "Done",
        targetStatusId: "6",
        targetStatusName: "Done",
        bandConcept: null,
        bandValue: null,
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([], 403),
    });

    expect(plan.kind).toBe("refused");
  });

  it("writes nothing when executing a refusal", async () => {
    const applyTransition = vi.fn();

    const outcome = await executeStatusMove(
      { kind: "refused", reason: "no transition" },
      "ENCUC-1",
      buildAdapter([]),
      vi.fn(),
      applyTransition,
    );

    expect(outcome.kind).toBe("refused");
    expect(applyTransition).not.toHaveBeenCalled();
  });
});

describe("the shapes a move can take", () => {
  it("is a field write alone when only the band changed", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("10002", "Testing", "Internal"),
      target: {
        columnName: "Testing",
        targetStatusId: "10002",
        targetStatusName: "Testing",
        bandConcept: "programIncrement",
        bandValue: "QE",
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([]),
    });

    expect(plan.kind).toBe("field-only");
    expect(plan.kind === "field-only" && plan.value).toBe("QE");
  });

  it("is a transition alone when there is no band", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("1", "To Do"),
      target: {
        columnName: "In Progress",
        targetStatusId: "3",
        targetStatusName: "In Progress",
        bandConcept: null,
        bandValue: null,
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([buildTransition("In Progress")]),
    });

    expect(plan.kind).toBe("transition-only");
  });

  it("asks for fields the transition screen demands, before sending anything", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("1", "To Do"),
      target: {
        columnName: "Done",
        targetStatusId: "6",
        targetStatusName: "Done",
        bandConcept: null,
        bandValue: null,
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([buildTransition("Done", ["resolution"])]),
    });

    expect(plan.kind).toBe("needs-fields");
    expect(plan.kind === "needs-fields" && plan.requiredFieldIds).toEqual(["resolution"]);
  });

  it("combines both into one request when the field is on the transition screen", async () => {
    const plan = await planStatusMove({
      issue: buildIssue("3", "In Progress"),
      target: {
        columnName: "Testing",
        targetStatusId: "10002",
        targetStatusName: "Testing",
        bandConcept: "programIncrement",
        bandValue: "QE",
      },
      fieldMap: buildFieldMap(),
      adapter: buildAdapter([buildTransition("Testing", [SUB_STATUS_FIELD])]),
    });

    expect(plan.kind).toBe("transition-with-field");
    expect(plan.kind === "transition-with-field" && plan.isFieldOnTransitionScreen).toBe(true);
  });
});

describe("a two-part move that half-succeeds", () => {
  it("does NOT revert the card, because Jira really did change", async () => {
    const outcome = await executeStatusMove(
      {
        kind: "transition-with-field",
        transition: buildTransition("Testing"),
        fieldId: SUB_STATUS_FIELD,
        value: "QE",
        isFieldOnTransitionScreen: false,
      },
      "ENCUC-1",
      buildAdapter([]),
      vi.fn(async () => false),
      vi.fn(async () => true),
    );

    expect(outcome.kind).toBe("partially-applied");
    expect(outcome.kind === "partially-applied" && outcome.shouldRevertCard).toBe(false);
  });

  it("names what worked and what did not, rather than reporting one outcome", async () => {
    const outcome = await executeStatusMove(
      {
        kind: "transition-with-field",
        transition: buildTransition("Testing"),
        fieldId: SUB_STATUS_FIELD,
        value: "QE",
        isFieldOnTransitionScreen: false,
      },
      "ENCUC-1",
      buildAdapter([]),
      vi.fn(async () => false),
      vi.fn(async () => true),
    );

    if (outcome.kind !== "partially-applied") return;
    expect(outcome.whatSucceeded).toMatch(/moved to Testing/i);
    expect(outcome.whatFailed).toMatch(/right column but not the right band/i);
  });

  it("transitions first, so the confusing half-state is the less confusing one", async () => {
    const order: string[] = [];

    await executeStatusMove(
      {
        kind: "transition-with-field",
        transition: buildTransition("Testing"),
        fieldId: SUB_STATUS_FIELD,
        value: "QE",
        isFieldOnTransitionScreen: false,
      },
      "ENCUC-1",
      buildAdapter([]),
      vi.fn(async () => {
        order.push("field");
        return true;
      }),
      vi.fn(async () => {
        order.push("transition");
        return true;
      }),
    );

    expect(order).toEqual(["transition", "field"]);
  });

  it("does not attempt the field write when the transition itself failed", async () => {
    const writeField = vi.fn(async () => true);

    const outcome = await executeStatusMove(
      {
        kind: "transition-with-field",
        transition: buildTransition("Testing"),
        fieldId: SUB_STATUS_FIELD,
        value: "QE",
        isFieldOnTransitionScreen: false,
      },
      "ENCUC-1",
      buildAdapter([]),
      writeField,
      vi.fn(async () => false),
    );

    expect(outcome.kind).toBe("failed");
    expect(writeField).not.toHaveBeenCalled();
  });
});
