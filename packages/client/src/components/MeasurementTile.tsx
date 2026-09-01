// MeasurementTile.tsx — The component that cannot render a bare number.
//
// It accepts a `Measure` and nothing else. There is no `count` prop, no
// `percent` prop and no `score` prop, so passing a plain number is a compile
// error rather than a code-review question. That is how the predecessor's
// defining defect is kept out of the surface layer: a failed check has no
// numeric form to be drawn in.
//
// The three states are told apart by shape and words as well as by colour.
// Green and amber are hard to separate under the commonest form of colour
// blindness, so every state carries a glyph and a sentence — someone reading a
// greyscale screenshot must still know which of the three they are looking at.

import type { JSX } from "react";

import type { Measure } from "@jira-plus/core";

/** How each state presents itself. Colour is never the only signal. */
const STATE_PRESENTATION = {
  pass: { glyph: "✓", label: "All clear", tone: "pass" },
  attention: { glyph: "!", label: "Needs attention", tone: "attn" },
  notApplicable: { glyph: "—", label: "Nothing in scope", tone: "na" },
  unresolved: { glyph: "?", label: "Can't be measured", tone: "attn" },
} as const;

/** Turns a blocker into a sentence naming what to do about it. */
function describeBlocker(measure: Extract<Measure, { state: "unresolved" }>): string {
  const { blocker } = measure;
  switch (blocker.kind) {
    case "retrieval-failed":
      return blocker.failure.kind === "jql-error"
        ? `The query failed: ${blocker.failure.jiraMessages.join(" ")}`
        : `The query did not run (${blocker.failure.kind}), so there is nothing to measure.`;
    case "concept-unmapped":
      return `No Jira field is mapped to ${blocker.conceptIds.join(", ")}, so this check did not run.`;
    case "concept-ambiguous":
      return `More than one Jira field matches ${blocker.conceptId}. Choose one in setup.`;
    case "history-unavailable":
      return `Change history is missing for ${blocker.affectedCount} issues, so this cannot be computed.`;
    case "lens-undefined":
      return `The "${blocker.lensId}" definition is not configured yet.`;
  }
}

/** What a tile shows, derived entirely from the measure's own state. */
function readPresentation(measure: Measure) {
  if (measure.state === "not-applicable") {
    return {
      ...STATE_PRESENTATION.notApplicable,
      figure: "0 of 0",
      explanation: measure.reason,
    };
  }

  if (measure.state === "unresolved") {
    return { ...STATE_PRESENTATION.unresolved, figure: "—", explanation: describeBlocker(measure) };
  }

  const flaggedCount = measure.flaggedKeys.length;
  const eligibleCount = measure.eligibleKeys.length;
  const suffix = measure.isPartial ? " — at least; the retrieval was incomplete" : "";

  return {
    ...(flaggedCount === 0 ? STATE_PRESENTATION.pass : STATE_PRESENTATION.attention),
    figure: `${flaggedCount} of ${eligibleCount}`,
    explanation:
      flaggedCount === 0
        ? `Every one of the ${eligibleCount} issues this applies to passed.${suffix}`
        : `Open the number to see exactly these ${flaggedCount} issues.${suffix}`,
  };
}

/** What the tile is asked to render. Deliberately no numeric prop. */
export interface MeasurementTileProps {
  readonly measure: Measure;
  readonly title: string;
  /** Called with the flagged keys, so a drill-through shows exactly what was counted. */
  readonly onOpenFlagged?: (issueKeys: readonly string[]) => void;
  /** Called with the population, so a wrong denominator is visible before the count is believed. */
  readonly onOpenPopulation?: (issueKeys: readonly string[]) => void;
}

/**
 * Renders one measurement.
 *
 * The number shown is `flaggedKeys.length` and the drill-through hands back
 * `flaggedKeys` — the same array — so a count and its issue list cannot
 * disagree.
 */
export function MeasurementTile({
  measure,
  title,
  onOpenFlagged,
  onOpenPopulation,
}: MeasurementTileProps): JSX.Element {
  const presentation = readPresentation(measure);
  const isDrillable = measure.state === "measured" && measure.flaggedKeys.length > 0;

  return (
    <article className={`tile tile--${presentation.tone}`} data-state={measure.state}>
      <h3 className="tile__title">{title}</h3>

      {isDrillable && onOpenFlagged ? (
        <button
          type="button"
          className="tile__figure tile__figure--button tabular"
          onClick={() => onOpenFlagged(measure.flaggedKeys)}
        >
          {presentation.figure}
        </button>
      ) : (
        <p className="tile__figure tabular">{presentation.figure}</p>
      )}

      <p className={`tile__state tile__state--${presentation.tone}`}>
        <span aria-hidden="true" className="tile__glyph">
          {presentation.glyph}
        </span>{" "}
        {presentation.label}
      </p>

      <p className="tile__explanation">{presentation.explanation}</p>

      {measure.state === "measured" && onOpenPopulation ? (
        <button
          type="button"
          className="tile__population"
          onClick={() => onOpenPopulation(measure.eligibleKeys)}
        >
          What does this apply to?
        </button>
      ) : null}
    </article>
  );
}
