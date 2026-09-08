// sectionTemplate.test.ts — The template is configuration, and empty is a choice.
//
// The predecessor froze one organisation's nine-section Feature template into a
// source module and threaded it through prompt text, reply normalisation and the
// commit diff. Changing a heading meant a release.
//
// The nine sections here are SEED VALUES for a document nobody has saved yet.
// Nothing reads them afterwards, and the assertion that matters most is the one
// about an empty template: it is valid, it means the description has no imposed
// structure, and it is a real choice somebody may want rather than a broken
// state to be defended against.

import { describe, expect, it } from "vitest";

import {
  SEED_DESCRIPTION_SECTIONS,
  hasImposedStructure,
  readSectionTemplate,
} from "../src/authoring/sectionTemplate.js";

describe("what ships in a document nobody has saved", () => {
  it("seeds the nine sections this organisation currently uses", () => {
    expect(SEED_DESCRIPTION_SECTIONS).toHaveLength(9);
    expect(SEED_DESCRIPTION_SECTIONS.map((section) => section.heading)).toContain("Risks");
  });

  it("gives each section a line saying what belongs in it", () => {
    // The guidance is stated to the assistant. A heading alone tells it the
    // shape but not the job.
    expect(SEED_DESCRIPTION_SECTIONS.every((section) => section.guidance.length > 0)).toBe(true);
  });
});

describe("reading a configured template", () => {
  it("keeps the configured order, because the order is the document's shape", () => {
    const sections = readSectionTemplate([
      { heading: "Risks", guidance: "What could go wrong." },
      { heading: "Description", guidance: "The problem." },
    ]);

    expect(sections.map((section) => section.heading)).toEqual(["Risks", "Description"]);
  });

  it("accepts a section with no guidance, since a heading alone is usable", () => {
    expect(readSectionTemplate([{ heading: "Risks" }])).toEqual([
      { heading: "Risks", guidance: "" },
    ]);
  });

  it("drops an entry with no heading rather than rendering a blank section", () => {
    expect(readSectionTemplate([{ heading: "   ", guidance: "x" }, { heading: "Risks" }])).toHaveLength(1);
  });
});

describe("an empty template", () => {
  it("is valid, and means the description has no imposed structure", () => {
    // A real choice, not a broken state.
    expect(readSectionTemplate([])).toEqual([]);
    expect(hasImposedStructure([])).toBe(false);
  });

  it("is what an unreadable stored value becomes, rather than an error", () => {
    // An unreadable template must not stop somebody writing an issue.
    expect(readSectionTemplate("not a list")).toEqual([]);
    expect(readSectionTemplate(null)).toEqual([]);
    expect(readSectionTemplate(undefined)).toEqual([]);
  });
});
