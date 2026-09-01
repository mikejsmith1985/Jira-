// askAnything.ts — Paste a query, add your own question, read the answer.
//
// The day-one pack, and the one the whole product was asked for. It writes
// nothing, needs no field mapping and needs no configuration, so it is useful
// before anything else has been set up — which is exactly what a tool with an
// adoption problem needs on its first screen.
//
// Because it proposes nothing, there is nothing to accept and nothing that can
// reach Jira. The worst outcome of a poor reply is a re-paste.

import type { DetailedIssue } from "../../model/detailedIssue.js";
import type { PromptPack, ValidatedItem } from "../promptPack.js";

/** How long an answer about one issue may be before it is shortened. */
const MAXIMUM_ANSWER_LENGTH = 1_200;

/** How long a supporting quotation may be. */
const MAXIMUM_EVIDENCE_LENGTH = 400;

/**
 * The free-form pack.
 *
 * The instruction asks for evidence alongside every answer, and for `null` when
 * the material does not support one. Both exist for the same reason: an
 * assistant given no way to say "the issues do not tell me" will invent
 * something that reads like an answer.
 */
export const ASK_ANYTHING_PACK: PromptPack = {
  packId: "ask-anything",
  title: "Ask anything",
  purpose:
    "Answer the reader's own question about these issues, using only what the issues say.",

  // Every retrieved issue, whatever it is. Narrowing belongs in the JQL, where
  // the user can see it and change it.
  isEligibleIssue: () => true,

  // No mapped concept is required, so this works on a fresh installation.
  promptConcepts: [],

  instruction: [
    "Read the issues below and answer the question that follows, for each issue",
    "individually. Base every answer only on what these issues actually say.",
    "",
    "For each issue, give your answer and quote the part of the issue that",
    "supports it. If the issue does not contain enough to answer, return null",
    "for both — that is a useful answer, and a guess is not.",
  ].join("\n"),

  itemSchema: {
    fields: [
      {
        name: "answer",
        kind: "text",
        maxLength: MAXIMUM_ANSWER_LENGTH,
        description: "Your answer for this issue, or null if the issue does not say",
      },
      {
        name: "evidence",
        kind: "text",
        maxLength: MAXIMUM_EVIDENCE_LENGTH,
        description: "The words from this issue that support the answer, or null",
      },
    ],
  },

  // Read-only by construction: no proposal means nothing to accept, and
  // nothing that could reach Jira.
  isReadOnly: true,
  toProposals: (_item: ValidatedItem, _issue: DetailedIssue) => [],
};
