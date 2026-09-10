// authoringPack.test.ts — A prompt that cannot ask for what Jira will refuse.
//
// There is no assistant API, so the only control over the reply is the prompt
// and the validator that reads it. Both descend from one declaration, so they
// cannot disagree — the predecessor grew sixteen hand-written build/parse pairs
// and several drifted apart, which shows up as items silently dropped.
//
// The rule with teeth: every field identifier in the prompt comes from the
// instance's own create screen, and a field with a fixed set of values has those
// values stated. A proposal outside either is dropped and NAMED — a silent drop
// is indistinguishable from the assistant not having proposed it.

import { describe, expect, it } from "vitest";

import {
  AUTHORING_BATCH_PACK_ID,
  AUTHORING_PACK_ID,
  MAXIMUM_BATCH_SIZE,
  buildAuthoringPromptHead,
  buildBatchPromptHead,
  parseBatchReply,
  chunkAuthoringPrompt,
  parseAuthoringReply,
} from "../src/authoring/authoringPack.js";
import {
  buildCreateScreenShape,
  describeUnavailableShape,
} from "../src/authoring/createScreenShape.js";
import { buildEmptyDraft } from "../src/authoring/draft.js";
import type { DescriptionSection } from "../src/authoring/sectionTemplate.js";

const NOW = "2026-09-08T09:14:00.000Z";

const SECTIONS: readonly DescriptionSection[] = [
  { heading: "Description", guidance: "The problem." },
  { heading: "Risks", guidance: "What could go wrong." },
];

/** A shape offering one free-text field and one with fixed values. */
const SHAPE = buildCreateScreenShape({
  projectKey: "DENP",
  issueTypeId: "10001",
  rawFields: {
    summary: { name: "Summary", required: true },
    customfield_10500: {
      name: "Initiative Type",
      allowedValues: [{ value: "Run" }, { value: "Grow" }],
    },
  },
});

/** The prompt head for a draft with something written in it. */
function buildHead(): string {
  return buildAuthoringPromptHead({
    draft: { ...buildEmptyDraft(NOW), operatorNarrative: "Members ring in on every plan change." },
    shape: SHAPE,
    sections: SECTIONS,
  });
}

describe("what the prompt asks for", () => {
  it("names only field identifiers the instance actually offers", () => {
    // The rule that stops a proposal Jira is certain to refuse from being made.
    const head = buildHead();

    expect(head).toContain("customfield_10500");
    expect(head).not.toContain("customfield_99999");
  });

  it("states the values a fixed-set field will accept", () => {
    expect(buildHead()).toContain("choose exactly one of: Run, Grow");
  });

  it("carries the operator's own words, which is what steers it", () => {
    expect(buildHead()).toContain("Members ring in on every plan change.");
  });

  it("asks for the configured sections, in the configured order", () => {
    const head = buildHead();

    expect(head.indexOf("Description —")).toBeLessThan(head.indexOf("Risks —"));
  });

  it("asks for free-form prose when no sections are configured", () => {
    const head = buildAuthoringPromptHead({
      draft: buildEmptyDraft(NOW),
      shape: SHAPE,
      sections: [],
    });

    expect(head).toContain("no required structure");
  });

  it("proposes no fields at all when the create screen could not be read", () => {
    // Better to ask for nothing than to ask for fields that may not exist.
    const head = buildAuthoringPromptHead({
      draft: buildEmptyDraft(NOW),
      shape: describeUnavailableShape("Jira could not be reached."),
      sections: SECTIONS,
    });

    expect(head).toContain("Do not propose any other fields.");
  });
});

describe("dividing a prompt too long to send", () => {
  /** Two sources, each too large to share one part. */
  const TWO_LONG_SOURCES = [
    { label: "a", text: "x".repeat(600) },
    { label: "b", text: "y".repeat(600) },
  ];

  it("repeats the head in every part, because a part without it is unanswerable", () => {
    const parts = chunkAuthoringPrompt({
      head: "HEAD",
      sources: TWO_LONG_SOURCES,
      budgetCharacters: 900,
    });

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.text.includes("HEAD"))).toBe(true);
  });

  it("numbers the parts, so a half-finished job is visible", () => {
    const parts = chunkAuthoringPrompt({
      head: "HEAD",
      sources: TWO_LONG_SOURCES,
      budgetCharacters: 900,
    });

    expect(parts.at(0)?.text).toContain("part 1 of 2");
  });

  it("says when a source was cut short, rather than sending half of it silently", () => {
    // Silently halving somebody's pasted brief is the failure this prevents.
    const parts = chunkAuthoringPrompt({
      head: "HEAD",
      sources: [{ label: "a", text: "x".repeat(20000) }],
      budgetCharacters: 5000,
    });

    expect(parts.at(0)?.hasTruncatedSource).toBe(true);
    expect(parts.at(0)?.text).toContain("cut short");
  });

  it("produces one part with no material, rather than none at all", () => {
    const parts = chunkAuthoringPrompt({ head: "HEAD", sources: [], budgetCharacters: 18000 });

    expect(parts).toHaveLength(1);
    expect(parts.at(0)?.text).toContain("gathered no material");
  });
});

describe("reading the reply", () => {
  /** Parses a reply against the standard shape and sections. */
  function parse(replyText: string) {
    return parseAuthoringReply({ replyText, shape: SHAPE, sections: SECTIONS });
  }

  it("takes the summary, description and criteria it proposed", () => {
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: {
          summary: "Show enrolment status",
          description: "Description:\nMembers cannot see it.\n\nRisks:\nNone known.",
          acceptanceCriteria: "Given a plan change…",
        },
      }),
    );

    expect(proposal.summary).toBe("Show enrolment status");
    expect(proposal.acceptanceCriteria).toBe("Given a plan change…");
    expect(proposal.description).toContain("Members cannot see it.");
  });

  it("rejects a reply belonging to another prompt, whole", () => {
    const proposal = parse(JSON.stringify({ packId: "somethingElse", issue: { summary: "S" } }));

    expect(proposal.refusedReason).toMatch(/rejected rather than partly applied/i);
    expect(proposal.summary).toBeNull();
  });

  it("rejects a reply that is not JSON at all, and takes nothing from it", () => {
    const proposal = parse("Sure! Here is your issue:");

    expect(proposal.refusedReason).toMatch(/could not be read as JSON/i);
  });

  it("drops a field the instance does not have, and names it", () => {
    // A silent drop is indistinguishable from the assistant not proposing it.
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", fields: { customfield_99999: "anything" } },
      }),
    );

    expect(proposal.rejectedFieldIds).toEqual(["customfield_99999"]);
    expect(proposal.fieldValues.customfield_99999).toBeUndefined();
  });

  it("drops a value the field would refuse, and names it, rather than guessing", () => {
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", fields: { customfield_10500: "Invented" } },
      }),
    );

    expect(proposal.rejectedValues).toEqual([{ fieldId: "customfield_10500", value: "Invented" }]);
    expect(proposal.fieldValues.customfield_10500).toBeUndefined();
  });

  it("keeps a value the field will accept", () => {
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", fields: { customfield_10500: "Run" } },
      }),
    );

    expect(proposal.fieldValues.customfield_10500).toBe("Run");
  });

  it("completes the sections the reply skipped, marking them rather than inventing", () => {
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", description: "Description:\nMembers cannot see it." },
      }),
    );

    expect(proposal.description).toContain("Risks:");
    expect(proposal.description).toContain("[NEEDS VALIDATION]");
  });

  it("removes any claim that an assistant wrote it", () => {
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: {
          summary: "S",
          description: "Description:\nGenerated by AI. Members cannot see it.",
        },
      }),
    );

    expect(proposal.description).not.toMatch(/generated by ai/i);
    expect(proposal.description).toContain("Members cannot see it.");
  });

  it("counts what it could not read rather than hiding it", () => {
    const proposal = parse(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", fields: "not an object" },
      }),
    );

    expect(proposal.unparsedCount).toBe(1);
  });

  it("writes nothing — a proposal is a proposal", () => {
    // Asserted by shape: the return carries no issue key and no write, so there
    // is nothing here that could reach Jira.
    const proposal = parse(JSON.stringify({ packId: AUTHORING_PACK_ID, issue: { summary: "S" } }));

    expect(Object.keys(proposal)).not.toContain("issueKey");
  });
});

describe("asking for several issues at once", () => {
  /** The head for a hierarchy prompt. */
  function buildBatchHead(isHierarchy: boolean): string {
    return buildBatchPromptHead({
      draft: { ...buildEmptyDraft(NOW), operatorNarrative: "Three things came out of the review." },
      shape: SHAPE,
      sections: SECTIONS,
      isHierarchy,
      parentTypeName: "Feature",
      childTypeName: "Story",
    });
  }

  it("asks for one parent and the work beneath it, in that order", () => {
    // The order is not cosmetic: a Story cannot be linked to a Feature that does
    // not exist yet, so the parent has to arrive first to be created first.
    const head = buildBatchHead(true);

    expect(head).toMatch(/ONE Feature/);
    expect(head).toMatch(/FIRST in the list/);
  });

  it("asks for independent items when there is no hierarchy", () => {
    const head = buildBatchHead(false);

    expect(head).toMatch(/separate Feature items/);
    expect(head).not.toMatch(/beneath it/);
  });

  it("says the shape rather than letting the assistant choose it", () => {
    // A pile of material that could be read either way would otherwise come back
    // differently every time it was asked.
    expect(buildBatchHead(true)).not.toBe(buildBatchHead(false));
  });

  it("caps how many it asks for, because a list nobody reads is unchecked", () => {
    expect(buildBatchHead(false)).toContain(`at most ${MAXIMUM_BATCH_SIZE}`);
  });
});

describe("reading a reply carrying several issues", () => {
  /** Parses a batch reply against the standard shape and sections. */
  function parseBatch(replyText: string) {
    return parseBatchReply({ replyText, shape: SHAPE, sections: SECTIONS });
  }

  /** A reply carrying the given issues. */
  function buildBatchReply(issues: readonly unknown[]): string {
    return JSON.stringify({ packId: AUTHORING_BATCH_PACK_ID, issues });
  }

  it("takes every issue it proposed", () => {
    const proposal = parseBatch(
      buildBatchReply([{ summary: "The Feature" }, { summary: "Story one" }]),
    );

    expect(proposal.issues.map((issue) => issue.summary)).toEqual(["The Feature", "Story one"]);
  });

  it("validates each one exactly as a lone reply is validated", () => {
    // The same function does both, so a batch cannot accept a field id that a
    // single issue would refuse.
    const proposal = parseBatch(
      buildBatchReply([{ summary: "S", fields: { customfield_99999: "x" } }]),
    );

    expect(proposal.issues.at(0)?.rejectedFieldIds).toEqual(["customfield_99999"]);
  });

  it("rejects a reply belonging to the single-issue prompt, whole", () => {
    const proposal = parseBatch(
      JSON.stringify({ packId: AUTHORING_PACK_ID, issue: { summary: "S" } }),
    );

    expect(proposal.refusedReason).toMatch(/rejected rather than partly applied/i);
    expect(proposal.issues).toHaveLength(0);
  });

  it("refuses a reply carrying no issues rather than producing an empty batch", () => {
    const proposal = parseBatch(buildBatchReply([]));

    expect(proposal.refusedReason).toMatch(/carried no issues/i);
  });

  it("cuts a reply past the readable ceiling, and counts what it cut", () => {
    // A proposal nobody reads is a proposal nobody checked, and this feature's
    // whole premise is that somebody reads it before it reaches Jira.
    const tooMany = Array.from({ length: MAXIMUM_BATCH_SIZE + 3 }, (unused, index) => ({
      summary: `Issue ${index}`,
    }));

    const proposal = parseBatch(buildBatchReply(tooMany));

    expect(proposal.issues).toHaveLength(MAXIMUM_BATCH_SIZE);
    expect(proposal.discardedCount).toBe(3);
  });

  it("completes each description's sections, exactly as it does for one issue", () => {
    const proposal = parseBatch(
      buildBatchReply([{ summary: "S", description: "Description:\nMembers cannot see it." }]),
    );

    expect(proposal.issues.at(0)?.description).toContain("[NEEDS VALIDATION]");
  });
});
