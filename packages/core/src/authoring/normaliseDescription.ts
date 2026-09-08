// normaliseDescription.ts — Every configured section present, in order, and a
// visible gap where the material did not support one.
//
// An assistant cannot be constrained: there is no API, so the reply arrives as
// whatever it arrives as. This makes a partial reply into a complete description
// rather than rejecting it — sections the reply skipped are still headed, and
// marked as needing validation, so a gap is visible rather than written over
// with something confident and invented.
//
// It must be idempotent. Running it over its own output has to change nothing,
// or a description accumulates markers every time somebody saves. The
// predecessor's version was idempotent for the same reason.
//
// The sections come from configuration, never from this file. The predecessor
// froze one organisation's nine into a module threaded through prompt text,
// reply normalisation and the commit diff, so changing a heading meant a
// release.

import type { DescriptionSection } from "./sectionTemplate.js";

/** What marks a section the material did not support. */
export const VALIDATION_MARKER = "[NEEDS VALIDATION]";

/**
 * Phrases claiming the text was written by an assistant.
 *
 * Removed on sight. A validation marker means information is MISSING; it is
 * never a disclaimer about authorship, and an issue carrying one reads as
 * untrustworthy for the wrong reason.
 */
const ATTRIBUTION_PATTERNS: readonly RegExp[] = [
  /\b(?:this (?:was |is )?(?:content |text |description )?(?:was )?)?(?:generated|written|drafted|created)\s+(?:by|with|using)\s+(?:an?\s+)?(?:ai|artificial intelligence|assistant|language model|llm|copilot|chatgpt|claude)\b[^.\n]*\.?/gi,
  /\bas an ai(?: language model)?\b[^.\n]*\.?/gi,
  /\bai[- ](?:generated|drafted|written|assisted)\b[^.\n]*\.?/gi,
  /\b(?:note|disclaimer)\s*:\s*[^.\n]*\bai\b[^.\n]*\.?/gi,
];

/** Removes any claim that an assistant wrote this. */
export function stripAttribution(text: string): string {
  let cleaned = text;
  for (const pattern of ATTRIBUTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Collapse the blank lines a removal can leave behind, without touching the
  // deliberate single blank line between sections.
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/** Is this line the heading for one of the configured sections? */
function findHeadingAt(
  line: string,
  sections: readonly DescriptionSection[],
): DescriptionSection | undefined {
  const withoutMarkup = line.replace(/^[#*\s]+/, "").trim();
  const beforeColon = withoutMarkup.split(":")[0]?.trim() ?? "";
  return sections.find(
    (section) => section.heading.toLowerCase() === beforeColon.toLowerCase(),
  );
}

/** Splits a description into whatever the configured sections hold. */
function readSectionBodies(
  description: string,
  sections: readonly DescriptionSection[],
): Map<string, string> {
  const bodies = new Map<string, string>();
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  /** Files whatever has been collected under the heading it belonged to. */
  const closeSection = (): void => {
    if (currentHeading !== null) {
      bodies.set(currentHeading, currentLines.join("\n").trim());
    }
    currentLines = [];
  };

  for (const line of description.split("\n")) {
    const heading = findHeadingAt(line, sections);
    if (heading !== undefined) {
      closeSection();
      currentHeading = heading.heading;
      // A heading may carry its content on the same line: "Risks: none known".
      const inlineBody = line.slice(line.indexOf(":") + 1).trim();
      currentLines = line.includes(":") && inlineBody.length > 0 ? [inlineBody] : [];
      continue;
    }
    if (currentHeading !== null) currentLines.push(line);
  }
  closeSection();

  return bodies;
}

/** Has this body already been marked as needing validation? */
function isAlreadyMarked(body: string): boolean {
  return body.startsWith(VALIDATION_MARKER);
}

/**
 * Re-emits a description with every configured section, in configured order.
 *
 * A section the text did not supply is still headed and marked, so the gap is
 * visible. Running this over its own output changes nothing.
 *
 * With no configured sections the description is returned as written, minus any
 * claim of assistant authorship — an empty template means free-form, which is a
 * real choice rather than a broken state.
 */
export function normaliseDescription(
  description: string,
  sections: readonly DescriptionSection[],
): string {
  const cleaned = stripAttribution(description);
  if (sections.length === 0) return cleaned;

  const bodies = readSectionBodies(cleaned, sections);

  return sections
    .map((section) => {
      const body = bodies.get(section.heading) ?? "";
      if (body.length === 0) {
        return `${section.heading}:\n${VALIDATION_MARKER} Nothing in the material covered this.`;
      }
      // Already-marked bodies are re-emitted untouched, which is what makes a
      // second run change nothing.
      return `${section.heading}:\n${isAlreadyMarked(body) ? body : body}`;
    })
    .join("\n\n");
}

/** Which configured sections are marked as needing validation? */
export function findUnvalidatedSections(
  description: string,
  sections: readonly DescriptionSection[],
): readonly string[] {
  const bodies = readSectionBodies(description, sections);
  return sections
    .filter((section) => isAlreadyMarked(bodies.get(section.heading) ?? ""))
    .map((section) => section.heading);
}
