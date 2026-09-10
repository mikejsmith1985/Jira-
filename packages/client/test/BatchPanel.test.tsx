// BatchPanel.test.tsx — A batch that failed halfway must say so.
//
// Six issues is six chances to fail on the fifth. If a retry created the Feature
// again, somebody would end up with two Features and three orphaned Stories, and
// nothing on screen would say so until a colleague found the second one.
//
// So the panel shows which items already exist, offers only the ones still
// missing, and says plainly that the created ones will not be repeated. The
// guarantee itself lives in the engine, per item; this is the screen being
// honest about it.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildBatch, buildEmptyDraft, recordCreatedKey } from "@jira-plus/core";
import type { AuthoringBatch, AuthoringDraft } from "@jira-plus/core";

import { BatchPanel } from "../src/components/authoring/BatchPanel.js";

afterEach(cleanup);

const NOW = "2026-09-10T09:14:00.000Z";

/** A draft with a summary, so items are distinguishable on screen. */
function buildDraft(summary: string): AuthoringDraft {
  return { ...buildEmptyDraft(NOW), summary };
}

/** One Feature and two Stories. */
function buildHierarchy(): AuthoringBatch {
  return buildBatch({
    shape: "feature-with-stories",
    drafts: [buildDraft("The Feature"), buildDraft("Story one"), buildDraft("Story two")],
    nowIso: NOW,
  });
}

/** The types this project offers. */
const ISSUE_TYPES = [
  { issueTypeId: "10001", name: "Feature", isSubtask: false },
  { issueTypeId: "10002", name: "Story", isSubtask: false },
];

/** Renders the panel over a batch. */
function renderPanel(
  batch: AuthoringBatch,
  overrides: Record<string, unknown> = {},
  parentIssueTypeId = "10001",
) {
  const handlers = {
    onShapeChange: vi.fn(),
    onRemove: vi.fn(),
    onWrite: vi.fn(),
    onChildIssueTypeChange: vi.fn(),
    ...overrides,
  };
  render(
    <BatchPanel
      batch={batch}
      isWriting={false}
      jiraBaseUrl=""
      issueTypes={ISSUE_TYPES}
      parentIssueTypeId={parentIssueTypeId}
      onShapeChange={handlers.onShapeChange as never}
      onRemove={handlers.onRemove as never}
      onWrite={handlers.onWrite as never}
      onChildIssueTypeChange={handlers.onChildIssueTypeChange as never}
    />,
  );
  return handlers;
}

/** A hierarchy whose Stories have been told what type to be. */
function buildTypedHierarchy(): AuthoringBatch {
  return { ...buildHierarchy(), childIssueTypeId: "10002" };
}

describe("choosing the shape", () => {
  it("offers both, and the operator decides rather than the assistant", () => {
    // A pile of material that could be read either way would otherwise come back
    // differently every time it was asked.
    renderPanel(buildHierarchy());

    expect(screen.getByRole("button", { name: /just features/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /a feature with stories/i })).toBeTruthy();
  });

  it("explains why the Feature is written first", () => {
    renderPanel(buildHierarchy());

    expect(screen.getByText(/cannot be linked to something that does not exist/i)).toBeTruthy();
  });

  it("reports a change of shape rather than deciding alone", async () => {
    const handlers = renderPanel(buildHierarchy());

    await userEvent.click(screen.getByRole("button", { name: /just features/i }));

    expect(handlers.onShapeChange).toHaveBeenCalledWith("flat");
  });
});

describe("the list", () => {
  it("marks which one is the Feature", () => {
    renderPanel(buildHierarchy());

    expect(screen.getByText("the Feature")).toBeTruthy();
  });

  it("offers to write everything when none of it exists yet", () => {
    renderPanel(buildTypedHierarchy());

    expect(screen.getByRole("button", { name: /create 3 in jira/i })).toBeTruthy();
  });

  it("says there is nothing yet, rather than showing an empty list", () => {
    renderPanel(buildBatch({ shape: "flat", drafts: [], nowIso: NOW }));

    expect(screen.getByText(/nothing yet/i)).toBeTruthy();
  });
});

describe("a batch that failed halfway", () => {
  /** A hierarchy in which the Feature was created and the Stories were not. */
  function buildHalfWritten(): AuthoringBatch {
    const batch = buildTypedHierarchy();
    return recordCreatedKey(batch, batch.items[0]!.itemId, "DENP-2001", {});
  }

  it("shows the key of what already exists", () => {
    renderPanel(buildHalfWritten());

    expect(screen.getByText("DENP-2001")).toBeTruthy();
  });

  it("says the created ones will not be created again", () => {
    // The whole hazard: a retry that repeated the Feature would leave two
    // Features and three orphaned Stories.
    renderPanel(buildHalfWritten());

    expect(screen.getByText(/will not be created again/i)).toBeTruthy();
  });

  it("offers only the ones still missing", () => {
    renderPanel(buildHalfWritten());

    expect(screen.getByRole("button", { name: /create 2 in jira/i })).toBeTruthy();
  });

  it("does not offer to remove something Jira already has", () => {
    // Removing it from the list would not remove it from Jira, and would lose
    // the key that stops it being created twice.
    renderPanel(buildHalfWritten());

    expect(screen.getAllByRole("button", { name: /^remove$/i })).toHaveLength(2);
  });
});

describe("when everything exists", () => {
  it("says so rather than offering a write that would do nothing", () => {
    let batch = buildBatch({ shape: "flat", drafts: [buildDraft("Only one")], nowIso: NOW });
    batch = recordCreatedKey(batch, batch.items[0]!.itemId, "DENP-1", {});

    renderPanel(batch);

    const button = screen.getByRole("button", { name: /all of these exist/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe("what type the Stories are created as", () => {
  // The 400 nobody could explain. Every item was created with the draft's own
  // type, so asking for a Feature with three Stories created four Features.
  it("asks, rather than assuming they are Features too", () => {
    renderPanel(buildHierarchy());

    expect(screen.getByLabelText(/type.*beneath|beneath.*type/i)).toBeTruthy();
  });

  it("does not ask in a flat batch, where nothing is beneath anything", () => {
    renderPanel(buildBatch({ shape: "flat", drafts: [buildDraft("One")], nowIso: NOW }));

    expect(screen.queryByLabelText(/beneath/i)).toBeNull();
  });

  it("reports the choice rather than making it", async () => {
    const handlers = renderPanel(buildHierarchy());

    await userEvent.selectOptions(screen.getByLabelText(/beneath/i), "10002");

    expect(handlers.onChildIssueTypeChange).toHaveBeenCalledWith("10002");
  });

  it("will not write until it has been told", () => {
    // Refusing here costs a click. Guessing costs somebody a board full of
    // Features that should have been Stories.
    renderPanel(buildHierarchy());

    const button = screen.getByRole("button", { name: /create 3 in jira/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("says why it will not, instead of a button that does nothing", () => {
    renderPanel(buildHierarchy());

    expect(screen.getByText(/not created as Features too/i)).toBeTruthy();
  });

  it("writes once it has been told", () => {
    renderPanel(buildTypedHierarchy());

    const button = screen.getByRole("button", { name: /create 3 in jira/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
