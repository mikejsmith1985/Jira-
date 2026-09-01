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

/** Renders one issue for the prompt. */
function renderIssue(issue: DetailedIssue, pack: PromptPack, context: PackContext): string {
  const summary = String(issue.fields.get("summary") ?? "");
  const lines = [
    `--- ${issue.key} (${issue.issueTypeName}, ${issue.statusName}) ---`,
    `Summary: ${summary.length > 0 ? summary : "(none in Jira)"}`,
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
    text: renderIssue(issue, pack, context),
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
