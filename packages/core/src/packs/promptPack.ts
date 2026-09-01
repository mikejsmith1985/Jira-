// promptPack.ts — One declaration where the predecessor had sixteen.
//
// The predecessor grew sixteen hand-written build/parse pairs over one envelope,
// one gate and one panel. Each pair could drift from its own partner, and
// several did — a prompt asking for one shape while its parser expected
// another, which shows up as items silently dropped.
//
// Here the item schema is declared ONCE and generates both halves: the
// "return exactly this shape" section of the prompt, and the validator that
// reads the reply. They cannot disagree, because there is only one of them.

// A proposal is declared once, beside the change set it becomes. Two
// declarations of the same idea is the duplication this codebase refuses
// everywhere else, and there is no reason for packs to be the exception.
import type { Proposal } from "../apply/buildChangeSet.js";
import type { ConceptId } from "../fields/conceptId.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";
import type { FieldMap } from "../workspace/workspaceConfig.js";

/** One field a pack asks the assistant to return. */
export type PackFieldSpec =
  | { readonly name: string; readonly kind: "text"; readonly maxLength: number; readonly description: string }
  | { readonly name: string; readonly kind: "enum"; readonly allowedValues: readonly string[]; readonly description: string }
  | { readonly name: string; readonly kind: "number"; readonly minimum?: number; readonly maximum?: number; readonly description: string }
  | { readonly name: string; readonly kind: "boolean"; readonly description: string }
  | { readonly name: string; readonly kind: "issueKeyList"; readonly description: string };

/** The shape of one reply item, declared once. */
export interface PackItemSchema {
  readonly fields: readonly PackFieldSpec[];
}

/** A field value after validation. `null` always means "no opinion". */
export type ValidatedFieldValue = string | number | boolean | readonly string[] | null;

/** One validated reply item. */
export interface ValidatedItem {
  readonly issueKey: string;
  readonly values: Readonly<Record<string, ValidatedFieldValue>>;
}

/** What a pack can see while deciding what to send and what to propose. */
export interface PackContext {
  readonly issueSet: IssueSet;
  readonly fieldMap: FieldMap;
  readConcept(issue: DetailedIssue, concept: ConceptId): unknown;
}

/** One job the assistant can be asked to do. */
export interface PromptPack {
  readonly packId: string;
  readonly title: string;
  /** Shown to the user, and stated to the assistant, so both know the job. */
  readonly purpose: string;
  isEligibleIssue(issue: DetailedIssue, context: PackContext): boolean;
  readonly promptConcepts: readonly ConceptId[];
  /** The fixed instruction block, reviewed once rather than composed per run. */
  readonly instruction: string;
  readonly itemSchema: PackItemSchema;
  toProposals(item: ValidatedItem, issue: DetailedIssue): readonly Proposal[];
  /** True when the pack only reads — no proposal, no write, nothing to accept. */
  readonly isReadOnly?: boolean;
}

/**
 * Renders the required reply shape from the schema.
 *
 * This is half of what makes drift impossible: the prompt's shape section and
 * the parser both descend from `itemSchema`, so a field cannot be asked for in
 * one and unknown to the other.
 */
export function renderItemSchema(schema: PackItemSchema): string {
  const lines = schema.fields.map((field) => {
    const requirement = describeFieldRequirement(field);
    return `    "${field.name}": ${requirement}   // ${field.description}`;
  });

  return [
    "{",
    '  "packId": "<the packId given above, exactly>",',
    '  "chunk": <this part\'s number>,',
    '  "of": <how many parts there are>,',
    '  "items": [',
    "    {",
    '      "key": "<one of the issue keys listed above, exactly>",',
    ...lines.map((line) => `  ${line}`),
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

/** Describes one field's accepted values, in the prompt's own words. */
function describeFieldRequirement(field: PackFieldSpec): string {
  switch (field.kind) {
    case "text":
      return `"<text, at most ${field.maxLength} characters, or null if you have no opinion>"`;
    case "enum":
      return `"<one of: ${field.allowedValues.join(" | ")}, or null>"`;
    case "number":
      return `<a number${field.minimum === undefined ? "" : ` from ${field.minimum}`}${
        field.maximum === undefined ? "" : ` to ${field.maximum}`
      }, or null>`;
    case "boolean":
      return "<true, false, or null if you have no opinion>";
    case "issueKeyList":
      return '["<issue key>", …] or null';
  }
}

/**
 * The rules every pack states, in one place.
 *
 * The last two matter most. Silence must mean "no opinion" rather than a value,
 * or an assistant that says nothing about a checkbox unticks something a person
 * deliberately set. And inventing an issue key is the commonest failure of all,
 * so the prompt says plainly that invented keys are discarded — which is also
 * what the ingest does.
 */
export const SHARED_PROMPT_RULES: readonly string[] = [
  "Reply with JSON only. No commentary before or after it.",
  "Use only the issue keys listed in this part. Any other key is discarded.",
  "Where you have no opinion about a field, return null. Do not guess.",
  "Never invent an issue, a field value, or a fact that is not in the material above.",
  "If the material does not support an answer, say so by returning null for that field.",
];
