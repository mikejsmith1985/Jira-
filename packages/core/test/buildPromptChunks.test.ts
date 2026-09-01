// buildPromptChunks.test.ts — Multi-part is the normal case, so it must be honest.
//
// Copilot's box takes about 18,000 characters and full issue content is allowed,
// so a real set of issues runs to several parts. Two properties therefore carry
// weight: an issue is never split across parts, and the number of parts is known
// before anybody starts copying — because a half-finished run that looks
// finished is exactly the failure this product exists to remove.

import { describe, expect, it } from "vitest";

import { buildPromptChunks } from "../src/packs/buildPromptChunks.js";
import type { PromptPack } from "../src/packs/promptPack.js";
import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";

/** A pack that renders whatever it is given. */
const SIMPLE_PACK: PromptPack = {
  packId: "simple",
  title: "Simple pack",
  purpose: "Test chunking.",
  isEligibleIssue: () => true,
  promptConcepts: [],
  instruction: "Answer for each issue.",
  itemSchema: { fields: [{ name: "note", kind: "text", maxLength: 200, description: "A note" }] },
  toProposals: () => [],
};

/** A pack that only wants stories. */
const STORIES_ONLY_PACK: PromptPack = {
  ...SIMPLE_PACK,
  packId: "stories-only",
  isEligibleIssue: (issue) => issue.issueTypeName === "Story",
};

/** Builds an issue set, optionally giving each issue a long description. */
function buildSet(count: number, options: { descriptionLength?: number; issueTypeName?: string } = {}) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary", "description"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: count,
    fetchedCount: count,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });

  const issues = Array.from({ length: count }, (_unused, index) => {
    const key = `ENCUC-${index + 1}`;
    return normaliseRawIssue(
      {
        id: key,
        key,
        fields: {
          summary: `Work on ${key}`,
          description: "x".repeat(options.descriptionLength ?? 100),
          issuetype: { name: options.issueTypeName ?? "Story" },
          status: { statusCategory: { key: "new" } },
        },
      },
      {},
    );
  });

  return buildIssueSet(record, issues);
}

/** The context a pack call needs. */
function buildContext(issueSet: ReturnType<typeof buildSet>) {
  return {
    issueSet,
    fieldMap: buildDefaultWorkspaceConfiguration().fieldMap,
    readConcept: () => null,
  };
}

describe("dividing on issue boundaries", () => {
  it("fits a small set into a single part", () => {
    const issueSet = buildSet(3);
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.issueKeyWhitelist).toHaveLength(3);
  });

  it("divides a large set into several parts", () => {
    const issueSet = buildSet(40, { descriptionLength: 800 });
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 6_000,
    });

    expect(result.chunks.length).toBeGreaterThan(1);
  });

  it("places every issue in exactly one part, so none is lost or duplicated", () => {
    const issueSet = buildSet(40, { descriptionLength: 800 });
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 6_000,
    });

    const placedKeys = result.chunks.flatMap((chunk) => chunk.issueKeyWhitelist);

    expect(new Set(placedKeys).size).toBe(placedKeys.length);
    expect(placedKeys.length + result.untransferableKeys.length).toBe(40);
  });

  it("makes every part independently complete, with its own instruction and keys", () => {
    const issueSet = buildSet(40, { descriptionLength: 800 });
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 6_000,
    });

    for (const chunk of result.chunks) {
      expect(chunk.text).toContain("packId: simple");
      expect(chunk.text).toContain("Answer for each issue.");
      expect(chunk.text).toContain("Return exactly this shape");
      for (const key of chunk.issueKeyWhitelist) expect(chunk.text).toContain(key);
    }
  });

  it("numbers the parts so the user knows how many there are before starting", () => {
    const issueSet = buildSet(40, { descriptionLength: 800 });
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 6_000,
    });

    const total = result.chunks.length;
    result.chunks.forEach((chunk, index) => {
      expect(chunk.index).toBe(index + 1);
      expect(chunk.total).toBe(total);
      expect(chunk.text).toContain(`part ${index + 1} of ${total}`);
    });
  });

  it("starts every part pending, so progress can be tracked", () => {
    const issueSet = buildSet(10);
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });

    expect(result.chunks.every((chunk) => chunk.state === "pending")).toBe(true);
  });
});

describe("an issue too large to send", () => {
  it("is reported rather than split across parts", () => {
    const issueSet = buildSet(1, { descriptionLength: 50_000 });
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });

    expect(result.untransferableKeys).toEqual(["ENCUC-1"]);
    expect(result.chunks).toHaveLength(0);
  });

  it("does not stop the others being sent", () => {
    const record = buildRetrievalRecord({
      jql: "project = ENCUC",
      fieldsRequested: ["summary"],
      expandRequested: ["names"],
      startedAtIso: "2026-09-01T09:14:00.000Z",
      durationMs: 10,
      totalMatchingCount: 2,
      fetchedCount: 2,
      ceiling: 2_000,
      changelogCoverage: "none",
      workspaceFingerprint: "a3f91c2e",
      failure: null,
    });
    const issueSet = buildIssueSet(record, [
      normaliseRawIssue(
        { id: "1", key: "ENCUC-1", fields: { summary: "small", description: "short", issuetype: { name: "Story" }, status: { statusCategory: { key: "new" } } } },
        {},
      ),
      normaliseRawIssue(
        { id: "2", key: "ENCUC-2", fields: { summary: "huge", description: "x".repeat(50_000), issuetype: { name: "Story" }, status: { statusCategory: { key: "new" } } } },
        {},
      ),
    ]);

    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });

    expect(result.untransferableKeys).toEqual(["ENCUC-2"]);
    expect(result.chunks[0]?.issueKeyWhitelist).toEqual(["ENCUC-1"]);
  });
});

describe("what goes into a prompt", () => {
  it("renders an absent value explicitly, so nothing invites invention", () => {
    const record = buildRetrievalRecord({
      jql: "project = ENCUC",
      fieldsRequested: ["summary"],
      expandRequested: ["names"],
      startedAtIso: "2026-09-01T09:14:00.000Z",
      durationMs: 10,
      totalMatchingCount: 1,
      fetchedCount: 1,
      ceiling: 2_000,
      changelogCoverage: "none",
      workspaceFingerprint: "a3f91c2e",
      failure: null,
    });
    const issueSet = buildIssueSet(record, [
      normaliseRawIssue(
        { id: "1", key: "ENCUC-1", fields: { summary: "Work", issuetype: { name: "Story" }, status: { statusCategory: { key: "new" } } } },
        {},
      ),
    ]);

    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });

    expect(result.chunks[0]?.text).toContain("(none in Jira)");
  });

  it("states the rules that keep a reply honest", () => {
    const issueSet = buildSet(1);
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });
    const text = result.chunks[0]?.text ?? "";

    expect(text).toContain("Any other key is discarded");
    expect(text).toContain("return null. Do not guess");
  });

  it("appends the user's own question when there is one", () => {
    const issueSet = buildSet(1);
    const result = buildPromptChunks(SIMPLE_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
      userQuestion: "Which of these are blocked on someone outside the team?",
    });

    expect(result.chunks[0]?.text).toContain("blocked on someone outside the team");
  });

  it("includes only the issues the pack applies to", () => {
    const record = buildRetrievalRecord({
      jql: "project = ENCUC",
      fieldsRequested: ["summary"],
      expandRequested: ["names"],
      startedAtIso: "2026-09-01T09:14:00.000Z",
      durationMs: 10,
      totalMatchingCount: 2,
      fetchedCount: 2,
      ceiling: 2_000,
      changelogCoverage: "none",
      workspaceFingerprint: "a3f91c2e",
      failure: null,
    });
    const issueSet = buildIssueSet(record, [
      normaliseRawIssue({ id: "1", key: "ENCUC-1", fields: { summary: "s", issuetype: { name: "Story" }, status: { statusCategory: { key: "new" } } } }, {}),
      normaliseRawIssue({ id: "2", key: "ENCUC-2", fields: { summary: "e", issuetype: { name: "Epic" }, status: { statusCategory: { key: "new" } } } }, {}),
    ]);

    const result = buildPromptChunks(STORIES_ONLY_PACK, issueSet, buildContext(issueSet), {
      budgetCharacters: 15_000,
    });

    expect(result.chunks[0]?.issueKeyWhitelist).toEqual(["ENCUC-1"]);
  });
});
