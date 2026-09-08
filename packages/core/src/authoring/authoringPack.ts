// authoringPack.ts — Asking the assistant, and reading what comes back.
//
// One declaration generates both halves. `AUTHORING_ITEM_FIELDS` produces the
// prompt's "return exactly this shape" section AND the validator that reads the
// reply, so the two cannot disagree — the predecessor grew sixteen hand-written
// build/parse pairs and several drifted, which shows up as items silently
// dropped.
//
// Two rules keep a reply from proposing something Jira will refuse. The prompt
// names ONLY field identifiers the instance actually offers, taken from the
// create screen; and for a field with a fixed set of values, it states them. A
// proposal outside either is dropped and reported, never sent and never guessed
// at.
//
// Nothing here writes. A parsed reply is a proposal that lands in the draft,
// where the operator can change or ignore it, and Jira is reached only by the
// create or save they press afterwards.

import { extractJsonPayload } from "../packs/extractJsonPayload.js";

import { isAllowedValue } from "./createScreenShape.js";
import type { CreateScreenShape } from "./createScreenShape.js";
import type { AuthoringDraft } from "./draft.js";
import { normaliseDescription } from "./normaliseDescription.js";
import type { DescriptionSection } from "./sectionTemplate.js";

/** The envelope identifier. A reply carrying any other is rejected whole. */
export const AUTHORING_PACK_ID = "jiraPlusIssueAuthor";

/** How much of one source is rendered before it is cut and said to be cut. */
export const SOURCE_EXCERPT_LIMIT = 4000;

/** What the assistant is asked to return, declared once. */
export const AUTHORING_ITEM_FIELDS = [
  { name: "summary", description: "One line somebody could recognise the issue by." },
  { name: "description", description: "The full description, using the sections named above." },
  { name: "acceptanceCriteria", description: "Things a tester could check without asking a question." },
] as const;

/** What a reply proposed, after validation. */
export interface AuthoringProposal {
  readonly summary: string | null;
  readonly description: string | null;
  readonly acceptanceCriteria: string | null;
  /** Instance-specific fields the assistant proposed and the instance offers. */
  readonly fieldValues: Readonly<Record<string, unknown>>;
  /** Field identifiers the instance does not have. Dropped, and named. */
  readonly rejectedFieldIds: readonly string[];
  /** Values a field would not accept. Dropped, and named. */
  readonly rejectedValues: readonly { readonly fieldId: string; readonly value: string }[];
  /** Content that could not be read at all. Counted, never hidden. */
  readonly unparsedCount: number;
  /** Set when the whole reply was refused, with the reason. */
  readonly refusedReason: string | null;
}

/** A reply that was refused outright. */
function refuseWholeReply(reason: string): AuthoringProposal {
  return {
    summary: null,
    description: null,
    acceptanceCriteria: null,
    fieldValues: {},
    rejectedFieldIds: [],
    rejectedValues: [],
    unparsedCount: 0,
    refusedReason: reason,
  };
}

/** The section list, written for the assistant to follow. */
function renderSections(sections: readonly DescriptionSection[]): string {
  if (sections.length === 0) {
    return "Write the description as continuous prose. There is no required structure.";
  }
  return [
    "Structure the description as these sections, in this exact order, each as a \"Heading:\" line:",
    ...sections.map((section) => `  ${section.heading} — ${section.guidance}`),
    "",
    "Where the material does not tell you enough to be sure, still propose content but begin that",
    `section with ${"[NEEDS VALIDATION]"}. A missing section is worse than a marked one.`,
  ].join("\n");
}

/** The fields the instance offers, with the values each will accept. */
function renderFields(shape: CreateScreenShape): string {
  if (shape.status !== "known" || shape.fields.length === 0) {
    return "Do not propose any other fields.";
  }
  return [
    "You may also set ONLY these fields, using the exact identifiers given. Do not invent one:",
    ...shape.fields.map((field) => {
      const options =
        field.allowedValues === null ? "" : ` — choose exactly one of: ${field.allowedValues.join(", ")}`;
      return `  "${field.fieldId}" (${field.name})${options}`;
    }),
  ].join("\n");
}

/** The reply shape, generated from the one declaration. */
function renderItemShape(shape: CreateScreenShape): string {
  const fieldLines = AUTHORING_ITEM_FIELDS.map(
    (field) => `    "${field.name}": "…"   // ${field.description}`,
  ).join("\n");
  const fieldsNote = shape.status === "known" && shape.fields.length > 0 ? '    "fields": { }' : '    "fields": { }';

  return [
    "Respond ONLY with valid JSON in exactly this shape:",
    "{",
    `  "packId": "${AUTHORING_PACK_ID}",`,
    "  \"issue\": {",
    fieldLines,
    fieldsNote,
    "  }",
    "}",
  ].join("\n");
}

/** The fixed head every part of the prompt repeats. */
export function buildAuthoringPromptHead(input: {
  readonly draft: AuthoringDraft;
  readonly shape: CreateScreenShape;
  readonly sections: readonly DescriptionSection[];
}): string {
  const { draft } = input;

  return [
    "You are helping somebody write a Jira issue their team can understand and commit to.",
    "",
    "In their own words:",
    draft.operatorNarrative.trim().length > 0
      ? draft.operatorNarrative
      : "(they have not written this yet — work from the material below)",
    "",
    draft.summary.trim().length > 0
      ? `Their current draft summary: ${draft.summary}`
      : "They have no draft summary yet.",
    "",
    renderSections(input.sections),
    "",
    renderFields(input.shape),
    "",
    "Lead the description with the problem and who has it, not the solution. Make every acceptance",
    "criterion something a tester could check without asking a question. Do not invent facts that are",
    "not in the material or in their own words. Never state or imply that this was written by an",
    "assistant.",
    "",
    renderItemShape(input.shape),
  ].join("\n");
}

/** Renders one source, cut at the limit and SAID to be cut. */
function renderSource(source: { label: string; text: string }): string {
  const isTooLong = source.text.length > SOURCE_EXCERPT_LIMIT;
  const body = isTooLong ? source.text.slice(0, SOURCE_EXCERPT_LIMIT) : source.text;
  const note = isTooLong ? "\n… (cut short — this source is longer than one part allows)" : "";
  return `--- ${source.label} ---\n${body}${note}`;
}

/** One part of a prompt too long to send at once. */
export interface AuthoringPromptPart {
  readonly partNumber: number;
  readonly partCount: number;
  readonly text: string;
  /** True when a source in this part was cut short. Said, never silent. */
  readonly hasTruncatedSource: boolean;
}

/**
 * Divides the prompt on SOURCE boundaries.
 *
 * The shipped chunker divides an issue set on issue boundaries and cannot be
 * reused: an authoring prompt has no issues, it has one draft and its sources.
 * The head — the narrative, the sections, the field list and the required reply
 * shape — repeats in every part, because a part without it is not answerable.
 */
export function chunkAuthoringPrompt(input: {
  readonly head: string;
  readonly sources: readonly { readonly label: string; readonly text: string }[];
  readonly budgetCharacters: number;
}): readonly AuthoringPromptPart[] {
  const rendered = input.sources.map(renderSource);
  const roomForSources = Math.max(input.budgetCharacters - input.head.length - 200, 500);

  const groups: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const source of rendered) {
    const cut = source.slice(0, roomForSources);
    if (current.length > 0 && currentLength + cut.length > roomForSources) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(cut);
    currentLength += cut.length;
  }
  if (current.length > 0 || groups.length === 0) groups.push(current);

  return groups.map((group, index) => ({
    partNumber: index + 1,
    partCount: groups.length,
    text: [
      input.head,
      "",
      groups.length > 1 ? `This is part ${index + 1} of ${groups.length}.` : "",
      "",
      group.length > 0 ? `They have gathered:\n\n${group.join("\n\n")}` : "They gathered no material.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
    hasTruncatedSource: group.some((source) => source.includes("cut short")),
  }));
}

/** Reads a string off a reply, or null when it said nothing usable. */
function readText(candidate: unknown): string | null {
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

/**
 * Validates one reply.
 *
 * Writes nothing. Everything refused is named rather than dropped quietly,
 * because a silent drop is indistinguishable from the assistant not having
 * proposed it.
 */
export function parseAuthoringReply(input: {
  readonly replyText: string;
  readonly shape: CreateScreenShape;
  readonly sections: readonly DescriptionSection[];
}): AuthoringProposal {
  let payload: unknown;
  try {
    payload = extractJsonPayload(input.replyText);
  } catch {
    return refuseWholeReply("That reply could not be read as JSON. Nothing was taken from it.");
  }

  if (payload === null || typeof payload !== "object") {
    return refuseWholeReply("That reply was not a JSON object. Nothing was taken from it.");
  }

  const envelope = payload as { packId?: unknown; issue?: unknown };
  if (envelope.packId !== AUTHORING_PACK_ID) {
    return refuseWholeReply(
      `That reply belongs to "${String(envelope.packId)}", not to this prompt. ` +
        `The whole reply was rejected rather than partly applied.`,
    );
  }

  if (envelope.issue === null || typeof envelope.issue !== "object") {
    return refuseWholeReply("That reply carried no issue. Nothing was taken from it.");
  }

  const issue = envelope.issue as Record<string, unknown>;
  const rejectedFieldIds: string[] = [];
  const rejectedValues: { fieldId: string; value: string }[] = [];
  const fieldValues: Record<string, unknown> = {};
  let unparsedCount = 0;

  const proposedFields = issue.fields;
  if (proposedFields !== undefined && proposedFields !== null && typeof proposedFields === "object") {
    for (const [fieldId, value] of Object.entries(proposedFields as Record<string, unknown>)) {
      const field =
        input.shape.status === "known"
          ? input.shape.fields.find((candidate) => candidate.fieldId === fieldId)
          : undefined;

      if (field === undefined) {
        rejectedFieldIds.push(fieldId);
        continue;
      }
      if (!isAllowedValue(field, value)) {
        rejectedValues.push({ fieldId, value: String(value) });
        continue;
      }
      fieldValues[fieldId] = value;
    }
  } else if (proposedFields !== undefined) {
    unparsedCount += 1;
  }

  const description = readText(issue.description);

  return {
    summary: readText(issue.summary),
    description: description === null ? null : normaliseDescription(description, input.sections),
    acceptanceCriteria: readText(issue.acceptanceCriteria),
    fieldValues,
    rejectedFieldIds,
    rejectedValues,
    unparsedCount,
    refusedReason: null,
  };
}
