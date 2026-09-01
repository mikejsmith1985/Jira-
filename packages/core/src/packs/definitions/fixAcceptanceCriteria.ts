// fixAcceptanceCriteria.ts — Writing the criteria that were never written.
//
// A preset: the user authors no prompt, picks no options and writes no
// instruction. They press a button, paste twice, and review a diff.
//
// The instruction is deliberately conservative about invention. An assistant
// asked to write acceptance criteria from a thin description will produce
// something plausible for every issue, including the ones where the material
// does not support it — so it is told to return null instead, and null is a
// perfectly good answer here.

import type { DetailedIssue } from "../../model/detailedIssue.js";
import type { PromptPack, ValidatedItem } from "../promptPack.js";
import type { Proposal } from "../../apply/buildChangeSet.js";

/** How long a set of criteria may be before it is shortened. */
const MAXIMUM_CRITERIA_LENGTH = 2_000;

/** Issue types whose completion is judged against written criteria. */
const CRITERIA_BEARING_TYPES: readonly string[] = ["story", "task", "feature", "epic", "improvement"];

export const FIX_ACCEPTANCE_CRITERIA_PACK: PromptPack = {
  packId: "fix-acceptance-criteria",
  title: "Write the missing acceptance criteria",
  purpose:
    "Draft acceptance criteria for issues that have none, using only what each issue already says.",

  isEligibleIssue: (issue) =>
    CRITERIA_BEARING_TYPES.includes(issue.issueTypeName.trim().toLowerCase()),

  promptConcepts: ["acceptanceCriteria"],

  instruction: [
    "For each issue below, write acceptance criteria in Given / When / Then form.",
    "",
    "Base them only on what the issue actually says. Where the summary and",
    "description do not contain enough to write criteria that the team could",
    "test against, return null. An issue that genuinely needs a conversation",
    "is better left empty than filled with something plausible - somebody will",
    "otherwise build against criteria nobody agreed.",
    "",
    "Where an issue already has criteria, leave it alone and return null.",
  ].join("\n"),

  itemSchema: {
    fields: [
      {
        name: "acceptanceCriteria",
        kind: "text",
        maxLength: MAXIMUM_CRITERIA_LENGTH,
        description: "Given / When / Then criteria, or null if the issue does not say enough",
      },
      {
        name: "confidence",
        kind: "enum",
        allowedValues: ["supported", "inferred", "guessed"],
        description: "How well the issue's own text supports what you wrote",
      },
    ],
  },

  toProposals: (item: ValidatedItem, issue: DetailedIssue): readonly Proposal[] => {
    const criteria = item.values.acceptanceCriteria;
    if (typeof criteria !== "string" || criteria.trim().length === 0) return [];

    // A guess is shown to the reviewer as a guess. It is not filtered out -
    // that decision belongs to the person reviewing, not to this function.
    const confidence = typeof item.values.confidence === "string" ? item.values.confidence : "unknown";

    return [
      {
        issueKey: issue.key,
        target: { kind: "concept", conceptId: "acceptanceCriteria" },
        proposedValue: criteria,
        writeRoute: "simple",
        rationale: `Drafted from the issue's own text; the assistant rated this "${confidence}".`,
        source: "pack",
      },
    ];
  },
};
