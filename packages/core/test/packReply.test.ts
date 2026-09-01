// packReply.test.ts — Every rung of the validation ladder.
//
// The assistant cannot be regression-tested, so the tool's only real control is
// what it accepts. Each of these cases is a way a reply can be wrong that would
// otherwise put a value nobody chose in front of somebody as a suggestion.

import { describe, expect, it } from "vitest";

import { buildPromptChunks } from "../src/packs/buildPromptChunks.js";
import { extractJsonPayload } from "../src/packs/extractJsonPayload.js";
import { parsePackReply } from "../src/packs/parsePackReply.js";
import type { PromptPack } from "../src/packs/promptPack.js";
import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";

/** A pack exercising every field kind at once. */
const TEST_PACK: PromptPack = {
  packId: "test-pack",
  title: "Test pack",
  purpose: "Exercise the validation ladder.",
  isEligibleIssue: () => true,
  promptConcepts: [],
  instruction: "Answer for each issue.",
  itemSchema: {
    fields: [
      { name: "note", kind: "text", maxLength: 20, description: "A short note" },
      { name: "size", kind: "enum", allowedValues: ["S", "M", "L"], description: "A size" },
      { name: "points", kind: "number", minimum: 1, maximum: 13, description: "Points" },
      { name: "isReady", kind: "boolean", description: "Ready?" },
      { name: "relatedKeys", kind: "issueKeyList", description: "Related issues" },
    ],
  },
  toProposals: () => [],
};

/** An issue set holding the given keys. */
function buildSet(keys: readonly string[]) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: keys.length,
    fetchedCount: keys.length,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  return buildIssueSet(
    record,
    keys.map((key) =>
      normaliseRawIssue(
        { id: key, key, fields: { summary: `Work on ${key}`, status: { statusCategory: { key: "new" } } } },
        {},
      ),
    ),
  );
}

/** The context every pack call needs. */
function buildContext(keys: readonly string[]) {
  const issueSet = buildSet(keys);
  return {
    issueSet,
    fieldMap: buildDefaultWorkspaceConfiguration().fieldMap,
    readConcept: () => null,
  };
}

/** One chunk covering the given keys. */
function buildChunk(keys: readonly string[]) {
  const context = buildContext(keys);
  const chunkSet = buildPromptChunks(TEST_PACK, context.issueSet, context, {
    budgetCharacters: 15_000,
  });
  return chunkSet.chunks[0]!;
}

/** A well-formed reply for one issue. */
function buildReply(items: readonly Record<string, unknown>[], packId = "test-pack"): string {
  return JSON.stringify({ packId, chunk: 1, of: 1, items });
}

describe("the envelope guard", () => {
  it("rejects a reply meant for a different task, whole", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", note: "fine" }], "a-different-pack"),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.rejection?.kind).toBe("wrong-pack");
    expect(result.items).toHaveLength(0);
  });

  it("names both packs so the mismatch is obvious", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([], "feature-composition"),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.rejection?.detail).toContain("feature-composition");
    expect(result.rejection?.detail).toContain("test-pack");
  });

  it("rejects a reply with no packId rather than guessing which task it answers", () => {
    const result = parsePackReply(
      TEST_PACK,
      JSON.stringify({ items: [] }),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.rejection?.kind).toBe("wrong-envelope");
  });

  it("reports unreadable text rather than throwing", () => {
    const result = parsePackReply(TEST_PACK, "I could not help with that.", buildChunk(["ENCUC-1"]));

    expect(result.rejection?.kind).toBe("unreadable");
  });
});

describe("invented issue keys", () => {
  it("drops an item whose key was not in this part", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([
        { key: "ENCUC-1", note: "real" },
        { key: "ZZZZ-999", note: "invented" },
      ]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.issueKey).toBe("ENCUC-1");
  });

  it("shows the invented key rather than dropping it silently", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ZZZZ-999", note: "invented" }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.unknownKeys).toEqual(["ZZZZ-999"]);
  });
});

describe("field validation", () => {
  it("accepts a declared enum value", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", size: "M" }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.items[0]?.values.size).toBe("M");
  });

  it("turns an undeclared enum value into null, never a nearest match", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", size: "Medium" }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.items[0]?.values.size).toBeNull();
  });

  it("rejects a number outside its declared range", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", points: 100 }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.items[0]?.values.points).toBeNull();
  });

  it("keeps a boolean tri-state, so silence cannot untick a human's value", () => {
    const withTrue = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", isReady: true }]),
      buildChunk(["ENCUC-1"]),
    );
    const withSilence = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1" }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(withTrue.items[0]?.values.isReady).toBe(true);
    expect(withSilence.items[0]?.values.isReady).toBeNull();
  });

  it("treats a non-boolean as no opinion rather than coercing it", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", isReady: "yes" }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.items[0]?.values.isReady).toBeNull();
  });

  it("shortens over-long text and names what it shortened", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ key: "ENCUC-1", note: "x".repeat(50) }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(String(result.items[0]?.values.note)).toHaveLength(20);
    expect(result.truncatedFields).toEqual([{ issueKey: "ENCUC-1", fieldName: "note" }]);
  });
});

describe("what could not be read", () => {
  it("counts an item that is not an object", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply(["nonsense" as unknown as Record<string, unknown>]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.unparsedCount).toBe(1);
  });

  it("counts an item with no key", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([{ note: "orphan" }]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.unparsedCount).toBe(1);
  });

  it("flags a duplicate rather than silently merging it", () => {
    const result = parsePackReply(
      TEST_PACK,
      buildReply([
        { key: "ENCUC-1", note: "first" },
        { key: "ENCUC-1", note: "second" },
      ]),
      buildChunk(["ENCUC-1"]),
    );

    expect(result.duplicateKeys).toEqual(["ENCUC-1"]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.values.note).toBe("second");
  });
});

describe("extractJsonPayload", () => {
  it("is a strict no-op on valid JSON", () => {
    const original = { packId: "test-pack", items: [{ key: "ENCUC-1", note: 'has "quotes"' }] };

    expect(extractJsonPayload(JSON.stringify(original))).toEqual(original);
  });

  it("strips a code fence", () => {
    const fenced = '```json\n{"packId":"test-pack","items":[]}\n```';

    expect(extractJsonPayload(fenced)).toEqual({ packId: "test-pack", items: [] });
  });

  it("ignores prose before and after the object", () => {
    const chatty = 'Certainly! Here is the JSON:\n{"packId":"test-pack","items":[]}\nLet me know.';

    expect(extractJsonPayload(chatty)).toEqual({ packId: "test-pack", items: [] });
  });

  it("repairs a trailing comma", () => {
    expect(extractJsonPayload('{"packId":"test-pack","items":[],}')).toEqual({
      packId: "test-pack",
      items: [],
    });
  });

  it("repairs a raw newline inside a string", () => {
    const withNewline = '{"packId":"test-pack","note":"line one\nline two"}';
    const parsed = extractJsonPayload(withNewline) as { note: string };

    expect(parsed.note).toContain("line one");
  });

  it("throws when there is no object at all, rather than returning nothing", () => {
    expect(() => extractJsonPayload("I cannot help with that.")).toThrow(/no json object/i);
  });
});
