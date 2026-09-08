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
  AUTHORING_PACK_ID,
  buildAuthoringPromptHead,
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
