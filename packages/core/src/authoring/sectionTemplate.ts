// sectionTemplate.ts — The shape of a description, as configuration.
//
// The predecessor froze one organisation's nine-section Feature template into a
// source module and threaded it through prompt text, reply normalisation and the
// commit diff. Changing a heading meant a release.
//
// Here the template is an ordered list in the workspace document. The nine
// sections below are SEED VALUES, written once, for a document that has never
// been saved. Nothing reads them afterwards — every later read comes from
// configuration, so an edited template takes effect on the next prompt.
//
// An empty template is valid and means the description has no imposed structure.
// That is a real choice somebody may want, not a broken state.

/** One section of a description. */
export interface DescriptionSection {
  /** The heading, as it appears in the description. */
  readonly heading: string;
  /** One line on what belongs in it, stated to the assistant. */
  readonly guidance: string;
}

/**
 * What ships in a workspace document that has never been saved.
 *
 * Seed values, not rules. They are this organisation's current Feature template
 * and are expected to be edited; nothing in the product depends on any
 * particular heading existing.
 */
export const SEED_DESCRIPTION_SECTIONS: readonly DescriptionSection[] = [
  {
    heading: "Description",
    guidance: "The problem and who has it. Lead with the problem, not the solution.",
  },
  {
    heading: "Benefit Hypothesis",
    guidance: "What improves if this is done, and how anyone would know.",
  },
  {
    heading: "Acceptance Criteria",
    guidance: "Things a tester could check without asking a question.",
  },
  {
    heading: "Assumptions",
    guidance: "What is being taken as true without having been confirmed.",
  },
  {
    heading: "Dependencies",
    guidance: "What must happen elsewhere, and who owns it.",
  },
  {
    heading: "In Scope",
    guidance: "What this work covers.",
  },
  {
    heading: "Out of Scope",
    guidance: "What it deliberately does not cover, so nobody assumes otherwise.",
  },
  {
    heading: "Risks",
    guidance: "What could go wrong, including any existing issue key already tracking it.",
  },
  {
    heading: "Non-Functional Requirements (NFR)",
    guidance: "Performance, security, availability and anything else measurable but not a feature.",
  },
];

/** Is this a usable section? */
function isUsableSection(candidate: unknown): candidate is DescriptionSection {
  if (candidate === null || typeof candidate !== "object") return false;
  const section = candidate as Partial<DescriptionSection>;
  return typeof section.heading === "string" && section.heading.trim().length > 0;
}

/**
 * Reads the configured template.
 *
 * A stored value that is not a list of sections is treated as no template rather
 * than as a reason to fail: an unreadable template must not stop somebody
 * writing an issue.
 *
 * @returns the sections in their configured order; an empty list means free-form.
 */
export function readSectionTemplate(
  storedSections: unknown,
): readonly DescriptionSection[] {
  if (!Array.isArray(storedSections)) return [];

  return storedSections.filter(isUsableSection).map((section) => ({
    heading: section.heading.trim(),
    guidance: typeof section.guidance === "string" ? section.guidance.trim() : "",
  }));
}

/** Does this template impose a structure at all? */
export function hasImposedStructure(sections: readonly DescriptionSection[]): boolean {
  return sections.length > 0;
}
