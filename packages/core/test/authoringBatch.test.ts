// authoringBatch.test.ts — A half-written batch must finish, not duplicate.
//
// Writing six issues is six chances to fail on the fifth. If a retry then
// created the Feature again, somebody would end up with two Features and three
// orphaned Stories — the single-issue duplicate hazard, at batch scale, and just
// as invisible until a colleague finds the second one.
//
// The answer is not a second mechanism. Each item carries the SAME single switch
// a lone draft does: a key means update, blank means create. Recording the key
// Jira gave makes that item's create branch unreachable, so a retry finishes the
// batch rather than repeating the half that worked.
//
// The other thing worth pinning is order. In a hierarchy the parent is written
// first, because a Story cannot be linked to a Feature that does not exist yet.

import { describe, expect, it } from "vitest";

import {
  addBatchItem,
  buildBatch,
  findBatchBlocker,
  findParentItem,
  findUncreatedItems,
  isPartlyWritten,
  readItemIssueTypeId,
  readWriteOrder,
  recordCreatedKey,
  removeBatchItem,
  updateBatchItem,
} from "../src/authoring/authoringBatch.js";
import { buildEmptyDraft, isEnrichingExistingIssue } from "../src/authoring/draft.js";
import type { AuthoringDraft } from "../src/authoring/draft.js";

const NOW = "2026-09-10T09:14:00.000Z";

/** A draft with a summary, so items are distinguishable. */
function buildDraft(summary: string): AuthoringDraft {
  return { ...buildEmptyDraft(NOW), summary };
}

/** One Feature and two Stories. */
function buildHierarchy() {
  return buildBatch({
    shape: "feature-with-stories",
    drafts: [buildDraft("The Feature"), buildDraft("Story one"), buildDraft("Story two")],
    nowIso: NOW,
  });
}

/** Three independent Features. */
function buildFlat() {
  return buildBatch({
    shape: "flat",
    drafts: [buildDraft("First"), buildDraft("Second"), buildDraft("Third")],
    nowIso: NOW,
  });
}

describe("a flat batch", () => {
  it("holds every issue as an equal", () => {
    expect(buildFlat().items.every((item) => !item.isParent)).toBe(true);
  });

  it("has no parent to find", () => {
    expect(findParentItem(buildFlat())).toBeUndefined();
  });

  it("writes in the order the operator sees, since nothing depends on anything", () => {
    expect(readWriteOrder(buildFlat()).map((item) => item.draft.summary)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });
});

describe("a Feature with Stories", () => {
  it("makes exactly one item the parent", () => {
    expect(buildHierarchy().items.filter((item) => item.isParent)).toHaveLength(1);
  });

  it("writes the parent first, because a Story cannot link to what does not exist", () => {
    const order = readWriteOrder(buildHierarchy());

    expect(order.at(0)?.draft.summary).toBe("The Feature");
  });

  it("never makes an added item a second parent", () => {
    // One parent, always. A second would leave the write order ambiguous and
    // some Stories linked to the wrong Feature.
    const batch = addBatchItem(buildHierarchy(), NOW);

    expect(batch.items.filter((item) => item.isParent)).toHaveLength(1);
  });
});

describe("editing the batch", () => {
  it("changes one item without disturbing the others", () => {
    const batch = buildFlat();
    const target = batch.items.at(1)!;

    const changed = updateBatchItem(batch, target.itemId, buildDraft("Renamed"));

    expect(changed.items.map((item) => item.draft.summary)).toEqual([
      "First",
      "Renamed",
      "Third",
    ]);
  });

  it("removes one", () => {
    const batch = buildFlat();

    const shorter = removeBatchItem(batch, batch.items.at(0)!.itemId);

    expect(shorter.items.map((item) => item.draft.summary)).toEqual(["Second", "Third"]);
  });

  it("adds an empty one, for an issue the assistant missed", () => {
    expect(addBatchItem(buildFlat(), NOW).items).toHaveLength(4);
  });
});

describe("a batch that failed halfway", () => {
  /** A hierarchy in which the Feature was created and the Stories were not. */
  function buildHalfWritten() {
    const batch = buildHierarchy();
    return recordCreatedKey(batch, batch.items.at(0)!.itemId, "DENP-2001", {
      summary: "The Feature",
    });
  }

  it("knows it is partly written", () => {
    expect(isPartlyWritten(buildHalfWritten())).toBe(true);
  });

  it("is not partly written before anything was created", () => {
    expect(isPartlyWritten(buildHierarchy())).toBe(false);
  });

  it("is not partly written once everything was", () => {
    let batch = buildFlat();
    for (const item of batch.items) batch = recordCreatedKey(batch, item.itemId, "DENP-1", {});

    expect(isPartlyWritten(batch)).toBe(false);
  });

  it("CANNOT create the item that already exists — this is the whole guarantee", () => {
    // A retry that created the Feature again would leave two Features and three
    // orphaned Stories, and nothing on screen would say so.
    const created = buildHalfWritten().items.at(0)!;

    expect(isEnrichingExistingIssue(created.draft)).toBe(true);
  });

  it("offers only the items that still need creating", () => {
    const remaining = findUncreatedItems(buildHalfWritten());

    expect(remaining.map((item) => item.draft.summary)).toEqual(["Story one", "Story two"]);
  });

  it("keeps what the created issue holds, so a later save writes only real changes", () => {
    // Without this the retry would rewrite every field on the issue it already
    // made, including a description nobody touched.
    const created = buildHalfWritten().items.at(0)!;

    expect(created.draft.loadedFieldValues).toEqual({ summary: "The Feature" });
  });
});

describe("what type each item is created as", () => {
  // The 400 nobody could explain. Every item in a hierarchy was created with the
  // draft's own issue type, so asking for a Feature with three Stories created
  // four Features - and where the instance forbids that, Jira refused with a
  // message the screen then threw away.
  it("creates the Feature as the type the draft chose", () => {
    const batch = { ...buildHierarchy(), childIssueTypeId: "10002" };

    expect(readItemIssueTypeId(batch, batch.items.at(0)!, "10001")).toBe("10001");
  });

  it("creates a Story as the STORY type, not as another Feature", () => {
    const batch = { ...buildHierarchy(), childIssueTypeId: "10002" };

    expect(readItemIssueTypeId(batch, batch.items.at(1)!, "10001")).toBe("10002");
  });

  it("creates every item of a flat batch as the one chosen type", () => {
    const batch = { ...buildFlat(), childIssueTypeId: "10002" };

    // Nothing is beneath anything, so the child type is not consulted at all.
    expect(batch.items.map((item) => readItemIssueTypeId(batch, item, "10001"))).toEqual([
      "10001",
      "10001",
      "10001",
    ]);
  });
});

describe("before writing a hierarchy", () => {
  it("refuses while no Story type has been chosen, rather than guessing", () => {
    // Guessing means creating Stories as Features. Refusing means saying so
    // before a single issue exists in Jira.
    expect(findBatchBlocker(buildHierarchy(), "10001")).toMatch(/type/i);
  });

  it("is happy once one has", () => {
    expect(findBatchBlocker({ ...buildHierarchy(), childIssueTypeId: "10002" }, "10001")).toBeNull();
  });

  it("never blocks a flat batch on a child type it will not use", () => {
    expect(findBatchBlocker(buildFlat(), "10001")).toBeNull();
  });

  it("refuses while no type has been chosen at all", () => {
    expect(findBatchBlocker(buildFlat(), "")).toMatch(/type/i);
  });
});
