// buildPromptChunks.ts — Dividing a prompt without dividing an issue.
//
// Copilot's input accepts roughly 18,000 characters and full issue content is
// permitted, so a real set of issues does not fit in one paste. Multi-part is
// the normal case here, not an edge case — which is why the part count is shown
// before anybody starts copying, and why each part's state is tracked.
//
// That tracking is the load-bearing piece. With several parts, the only thing
// standing between a half-answered run and a result that reads as complete is
// knowing which parts came back.

import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";
import { SHARED_PROMPT_RULES, renderItemSchema } from "./promptPack.js";
import type { PackContext, PromptPack } from "./promptPack.js";
import { CONCEPT_DESCRIPTIONS } from "../fields/conceptId.js";

/** How far a part has got through the copy-and-paste round trip. */
export type ChunkState = "pending" | "copied" | "returned";

/** One paste-ready part of a prompt. */
export interface PromptChunk {
  readonly index: number;
  readonly total: number;
  readonly text: string;
  /** The only issue keys whose items will be accepted from this part's reply. */
  readonly issueKeyWhitelist: readonly string[];
  readonly characterCount: number;
  readonly state: ChunkState;
}

/** Every part, plus what could not be sent at all. */
export interface PromptChunkSet {
  readonly chunks: readonly PromptChunk[];
  /** Issues whose own detail exceeds the budget: named, never split, never dropped silently. */
  readonly untransferableKeys: readonly string[];
  readonly budgetCharacters: number;
}

/** How many comments travel with an issue. The recent ones carry the argument. */
const MAXIMUM_COMMENTS = 6;

/** How much of one comment travels. Enough to carry a decision, not a thread. */
const MAXIMUM_COMMENT_LENGTH = 600;

/** How many status moves travel. Enough to show the shape of a churn. */
const MAXIMUM_STATUS_MOVES = 8;

/** A date without a time, which is the resolution these questions are asked at. */
function readDay(isoText: unknown): string {
  const text = String(isoText ?? "");
  return text.length >= 10 ? text.slice(0, 10) : "";
}

/** Reads a person's name out of whichever shape Jira used. */
function readPersonName(value: unknown): string {
  if (value === null || value === undefined) return "";
  const person = value as { displayName?: unknown; name?: unknown };
  return String(person.displayName ?? person.name ?? "");
}

/**
 * The one-line facts about an issue.
 *
 * Every one of these was already being retrieved and thrown away when the
 * prompt was built. An assistant asked whether a status is right, and given
 * only the status, has nothing to answer with.
 */
function renderFacts(issue: DetailedIssue): readonly string[] {
  const facts: string[] = [];
  const assignee = readPersonName(issue.fields.get("assignee"));
  facts.push(`Assignee: ${assignee.length > 0 ? assignee : "(unassigned)"}`);

  const updated = readDay(issue.fields.get("updated"));
  facts.push(
    `Created ${readDay(issue.createdIso)}` +
      (updated.length > 0 ? `, last changed ${updated}` : "") +
      (issue.resolutionDateIso === null ? "" : `, resolved ${readDay(issue.resolutionDateIso)}`),
  );

  const parent = issue.fields.get("parent") as { key?: unknown } | undefined;
  if (parent?.key !== undefined) facts.push(`Parent: ${String(parent.key)}`);

  const fixVersions = issue.fields.get("fixVersions");
  if (Array.isArray(fixVersions) && fixVersions.length > 0) {
    facts.push(`Fix version: ${fixVersions.map((one) => String(one?.name ?? one)).join(", ")}`);
  }

  const labels = issue.fields.get("labels");
  if (Array.isArray(labels) && labels.length > 0) facts.push(`Labels: ${labels.join(", ")}`);

  return facts;
}

/**
 * The comments, most recent first.
 *
 * The largest single omission. A disagreement about whether an issue is in the
 * right status is settled in its comments far more often than in its
 * description — and the description was all that was being sent.
 *
 * Absent and not-retrieved are kept apart on purpose: they support opposite
 * conclusions, and an assistant that cannot tell them apart fills the gap in.
 */
function renderComments(issue: DetailedIssue): readonly string[] {
  const container = issue.fields.get("comment") as { comments?: unknown } | undefined;
  if (container === undefined || container === null) {
    return ["Comments: not retrieved — do not read this as an issue with no discussion."];
  }

  const all = Array.isArray(container.comments) ? container.comments : [];
  if (all.length === 0) return ["Comments: (none in Jira)"];

  const recent = all.slice(-MAXIMUM_COMMENTS).reverse();
  const lines = [`Comments (${all.length}, most recent first):`];
  for (const comment of recent) {
    const one = comment as { author?: unknown; created?: unknown; body?: unknown };
    const body = String(one.body ?? "").trim().slice(0, MAXIMUM_COMMENT_LENGTH);
    lines.push(`  [${readDay(one.created)} ${readPersonName(one.author)}] ${body}`);
  }
  if (all.length > MAXIMUM_COMMENTS) {
    lines.push(`  (${all.length - MAXIMUM_COMMENTS} earlier comments not shown)`);
  }
  return lines;
}

/**
 * How the issue reached the status it is in.
 *
 * "Is this in the right status" cannot be answered from the status. It is
 * answered from how long it has been there and what it moved back from.
 */
function renderStatusHistory(issue: DetailedIssue): readonly string[] {
  if (issue.changelog === null) {
    return ["Status history was not retrieved — do not read this as an issue that never moved."];
  }

  const moves = issue.changelog
    .flatMap((entry) =>
      entry.items
        .filter((item) => item.field === "status")
        .map((item) => `  ${readDay(entry.atIso)}: ${item.fromString ?? "?"} → ${item.toString ?? "?"}`),
    )
    .slice(-MAXIMUM_STATUS_MOVES);

  if (moves.length === 0) return ["Status history: never moved from its first status."];
  return ["Status history:", ...moves];
}

/**
 * Renders one issue for the prompt.
 *
 * Exported because what an assistant is given decides what it can answer, and
 * that deserves assertions of its own. Asked which issues were in the wrong
 * status, it returned null for issue after issue — correctly, because the
 * evidence had been left behind.
 */
export function renderIssueForPrompt(
  issue: DetailedIssue,
  pack: PromptPack,
  context: PackContext,
): string {
  const summary = String(issue.fields.get("summary") ?? "");
  const lines = [
    `--- ${issue.key} (${issue.issueTypeName}, ${issue.statusName}) ---`,
    `Summary: ${summary.length > 0 ? summary : "(none in Jira)"}`,
    ...renderFacts(issue),
  ];

  for (const conceptId of pack.promptConcepts) {
    const label = CONCEPT_DESCRIPTIONS[conceptId].label;
    const rawValue = context.readConcept(issue, conceptId);
    // An absent value is rendered explicitly. An empty label invites the
    // assistant to invent content to fill it.
    const rendered =
      rawValue === null || rawValue === undefined || String(rawValue).trim().length === 0
        ? "(none in Jira)"
        : String(rawValue);
    lines.push(`${label}: ${rendered}`);
  }

  const description = String(issue.fields.get("description") ?? "").trim();
  lines.push(`Description: ${description.length > 0 ? description : "(none in Jira)"}`);
  lines.push(...renderStatusHistory(issue));
  lines.push(...renderComments(issue));

  return lines.join("\n");
}

/** Builds the instruction block every part repeats in full. */
function renderHeader(
  pack: PromptPack,
  index: number,
  total: number,
  issueKeys: readonly string[],
  userQuestion: string | undefined,
): string {
  const sections = [
    `You are helping with Jira issues. Task: ${pack.title}.`,
    `Purpose: ${pack.purpose}`,
    "",
    `This is part ${index} of ${total}.`,
    `packId: ${pack.packId}`,
    "",
    "Rules:",
    ...SHARED_PROMPT_RULES.map((rule) => `- ${rule}`),
    "",
    `Issue keys in this part (${issueKeys.length}): ${issueKeys.join(", ")}`,
    "",
    pack.instruction,
  ];

  if (userQuestion !== undefined && userQuestion.trim().length > 0) {
    sections.push("", "What I want to know:", userQuestion.trim());
  }

  sections.push("", "Return exactly this shape:", renderItemSchema(pack.itemSchema), "", "Issues:");
  return sections.join("\n");
}

/** Options a caller controls. */
export interface ChunkOptions {
  readonly budgetCharacters: number;
  readonly userQuestion?: string;
}

/**
 * Divides a pack's prompt into paste-ready parts.
 *
 * Division happens on issue boundaries only. An issue whose own rendering
 * exceeds the budget is reported as untransferable and skipped — never split
 * across parts, because half an issue invites an answer about an issue that does
 * not exist.
 */
export function buildPromptChunks(
  pack: PromptPack,
  issueSet: IssueSet,
  context: PackContext,
  options: ChunkOptions,
): PromptChunkSet {
  const eligible = issueSet.issues.filter((issue) => pack.isEligibleIssue(issue, context));

  const rendered = eligible.map((issue) => ({
    issue,
    text: renderIssueForPrompt(issue, pack, context),
  }));

  // A header is repeated in every part, so the room left for issues is the
  // budget minus a generous allowance for it.
  const headerAllowance = renderHeader(pack, 1, 1, ["ENCUC-00000"], options.userQuestion).length + 200;
  const roomForIssues = Math.max(0, options.budgetCharacters - headerAllowance);

  const untransferableKeys: string[] = [];
  const groups: { issues: DetailedIssue[]; texts: string[]; length: number }[] = [];
  let current = { issues: [] as DetailedIssue[], texts: [] as string[], length: 0 };

  for (const entry of rendered) {
    if (entry.text.length > roomForIssues) {
      untransferableKeys.push(entry.issue.key);
      continue;
    }

    if (current.length + entry.text.length > roomForIssues && current.issues.length > 0) {
      groups.push(current);
      current = { issues: [], texts: [], length: 0 };
    }

    current.issues.push(entry.issue);
    current.texts.push(entry.text);
    current.length += entry.text.length + 2;
  }

  if (current.issues.length > 0) groups.push(current);

  const total = groups.length;
  const chunks = groups.map((group, groupIndex): PromptChunk => {
    const index = groupIndex + 1;
    const issueKeys = group.issues.map((issue) => issue.key);
    const text = `${renderHeader(pack, index, total, issueKeys, options.userQuestion)}\n\n${group.texts.join("\n\n")}`;
    return {
      index,
      total,
      text,
      issueKeyWhitelist: issueKeys,
      characterCount: text.length,
      state: "pending",
    };
  });

  return { chunks, untransferableKeys, budgetCharacters: options.budgetCharacters };
}
