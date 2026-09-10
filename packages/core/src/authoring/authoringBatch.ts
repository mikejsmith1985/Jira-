// authoringBatch.ts — Several issues from one pile of material.
//
// A Product Owner rarely has exactly one issue in front of them. They have a
// brief that is plainly three Features, or one Feature that is five Stories.
// Making them run the whole round trip once per issue is the friction this
// removes.
//
// Two shapes, and the operator says which:
//
//   * FLAT — several issues of one type, independent of each other.
//   * FEATURE WITH STORIES — one parent and the work beneath it, linked.
//
// The hazard that matters is partial failure. A batch of six that creates the
// Feature and then fails on two Stories must not, on the second attempt, create
// a SECOND Feature. So a created key is written back onto its own item, and
// every item carries the same single switch a lone draft does: a key means
// update, blank means create. Retrying a half-finished batch therefore finishes
// it rather than duplicating the half that worked.
//
// That is the same guarantee as the single-issue path, applied per item, rather
// than a second mechanism that could disagree with it.

import { buildEmptyDraft, isEnrichingExistingIssue } from "./draft.js";
import type { AuthoringDraft } from "./draft.js";

/** What shape the operator is writing. */
export type BatchShape = "flat" | "feature-with-stories";

/** One issue in a batch, and where it stands. */
export interface BatchItem {
  readonly itemId: string;
  readonly draft: AuthoringDraft;
  /**
   * In a hierarchy, is this the parent?
   *
   * Exactly one item is, and it is created first — the others need its key.
   */
  readonly isParent: boolean;
}

/** Several issues written from one pile of material. */
export interface AuthoringBatch {
  readonly shape: BatchShape;
  readonly items: readonly BatchItem[];
  /**
   * What type the items BENEATH the parent are created as. Blank until chosen.
   *
   * Without this every item in a hierarchy was created as the draft's own type,
   * so "a Feature with three Stories" quietly became four Features - and on an
   * instance that forbids that, Jira refused the whole write.
   */
  readonly childIssueTypeId: string;
}

/** Distinguishes one item from another. */
function buildItemId(index: number, nowIso: string): string {
  return `item-${Date.parse(nowIso).toString(36)}-${index}`;
}

/** A batch with nothing in it yet. */
export function buildEmptyBatch(shape: BatchShape): AuthoringBatch {
  return { shape, items: [], childIssueTypeId: "" };
}

/**
 * Turns a list of drafts into a batch.
 *
 * In a hierarchy the FIRST is the parent, because the assistant is asked for it
 * first and creation has to follow the same order — a Story cannot be linked to
 * a Feature that does not exist yet.
 */
export function buildBatch(input: {
  readonly shape: BatchShape;
  readonly drafts: readonly AuthoringDraft[];
  readonly nowIso: string;
}): AuthoringBatch {
  return {
    shape: input.shape,
    childIssueTypeId: "",
    items: input.drafts.map((draft, index) => ({
      itemId: buildItemId(index, input.nowIso),
      draft,
      isParent: input.shape === "feature-with-stories" && index === 0,
    })),
  };
}

/** Adds one empty item, so somebody can write an issue the assistant missed. */
export function addBatchItem(batch: AuthoringBatch, nowIso: string): AuthoringBatch {
  return {
    ...batch,
    items: [
      ...batch.items,
      {
        itemId: buildItemId(batch.items.length, nowIso),
        draft: buildEmptyDraft(nowIso),
        // Never a parent: one already exists, or this is a flat batch.
        isParent: false,
      },
    ],
  };
}

/** Removes one item. */
export function removeBatchItem(batch: AuthoringBatch, itemId: string): AuthoringBatch {
  return { ...batch, items: batch.items.filter((item) => item.itemId !== itemId) };
}

/** Replaces one item's draft, leaving everything else alone. */
export function updateBatchItem(
  batch: AuthoringBatch,
  itemId: string,
  draft: AuthoringDraft,
): AuthoringBatch {
  return {
    ...batch,
    items: batch.items.map((item) => (item.itemId === itemId ? { ...item, draft } : item)),
  };
}

/**
 * Records the key Jira gave an item.
 *
 * This is what makes a retry finish a half-written batch rather than duplicate
 * the half that worked: once an item has a key, its own create branch is
 * unreachable, exactly as for a lone draft.
 */
export function recordCreatedKey(
  batch: AuthoringBatch,
  itemId: string,
  issueKey: string,
  loadedFieldValues: Readonly<Record<string, unknown>>,
): AuthoringBatch {
  return {
    ...batch,
    items: batch.items.map((item) =>
      item.itemId === itemId
        ? { ...item, draft: { ...item.draft, existingIssueKey: issueKey, loadedFieldValues } }
        : item,
    ),
  };
}

/** The item that will be created first, or undefined in a flat batch. */
export function findParentItem(batch: AuthoringBatch): BatchItem | undefined {
  return batch.items.find((item) => item.isParent);
}

/**
 * The order items must be written in.
 *
 * The parent first, because a child cannot be linked to an issue that does not
 * exist. A flat batch keeps the order the operator sees.
 */
export function readWriteOrder(batch: AuthoringBatch): readonly BatchItem[] {
  if (batch.shape !== "feature-with-stories") return batch.items;
  return [...batch.items].sort((first, second) => Number(second.isParent) - Number(first.isParent));
}

/** Items still to be created, as opposed to ones a previous attempt made. */
export function findUncreatedItems(batch: AuthoringBatch): readonly BatchItem[] {
  return batch.items.filter((item) => !isEnrichingExistingIssue(item.draft));
}

/** Has some of this batch already been written? */
export function isPartlyWritten(batch: AuthoringBatch): boolean {
  const created = batch.items.filter((item) => isEnrichingExistingIssue(item.draft));
  return created.length > 0 && created.length < batch.items.length;
}

/**
 * The Jira issue type one item is created as.
 *
 * The parent - and everything in a flat batch - is the type the draft chose.
 * Only the items beneath a parent take the child type.
 */
export function readItemIssueTypeId(
  batch: AuthoringBatch,
  item: BatchItem,
  parentIssueTypeId: string,
): string {
  if (batch.shape !== "feature-with-stories" || item.isParent) return parentIssueTypeId;
  return batch.childIssueTypeId;
}

/** Chooses what the items beneath the parent are created as. */
export function setChildIssueTypeId(batch: AuthoringBatch, issueTypeId: string): AuthoringBatch {
  return { ...batch, childIssueTypeId: issueTypeId };
}

/**
 * Why this batch cannot be written yet, or null.
 *
 * Refusing before anything exists is the whole point: guessing a type means
 * creating Stories as Features, which is only discovered by someone opening
 * the board.
 */
export function findBatchBlocker(
  batch: AuthoringBatch,
  parentIssueTypeId: string,
): string | null {
  if (parentIssueTypeId.trim().length === 0) {
    return "Choose an issue type before writing.";
  }
  if (batch.shape === "feature-with-stories" && batch.childIssueTypeId.trim().length === 0) {
    return "Choose what type the issues beneath the Feature are, so they are not created as Features too.";
  }
  return null;
}
