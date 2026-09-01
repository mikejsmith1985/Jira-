// deliveryNarrative.ts — A paragraph somebody can put in a status update.
//
// Read-only. It proposes nothing and writes nothing, so the worst outcome of a
// poor reply is a re-paste.
//
// The instruction forbids adjectives the numbers do not support. A delivery
// narrative that calls a flat quarter "strong momentum" costs more credibility
// than it buys, and the whole product is an argument for saying only what can
// be checked.

import type { PromptPack } from "../promptPack.js";

/** How long the narrative may be. Long enough for a paragraph, not a report. */
const MAXIMUM_NARRATIVE_LENGTH = 1_500;

export const DELIVERY_NARRATIVE_PACK: PromptPack = {
  packId: "delivery-narrative",
  title: "Write the delivery update",
  purpose:
    "Turn what these issues show into a paragraph for a status update, claiming nothing the " +
    "issues do not support.",

  isEligibleIssue: () => true,
  promptConcepts: [],

  instruction: [
    "Write one short paragraph summarising what this work shows, for somebody",
    "who will not read the issue list.",
    "",
    "Rules that matter more than the prose:",
    "- Use no adjective the numbers do not support. Do not call a flat period",
    "  'strong', or a slow one 'challenging'. Say what happened.",
    "- Name specific issues where they carry the point.",
    "- If the set does not support a conclusion, say that instead. 'Too few",
    "  items finished to draw a trend' is a useful sentence.",
    "- Do not describe yourself, and do not mention that this was generated.",
  ].join("\n"),

  itemSchema: {
    fields: [
      {
        name: "narrative",
        kind: "text",
        maxLength: MAXIMUM_NARRATIVE_LENGTH,
        description: "The paragraph, or null if the set does not support one",
      },
    ],
  },

  isReadOnly: true,
  toProposals: () => [],
};
