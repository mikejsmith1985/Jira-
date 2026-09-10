// SectionTemplatePanel.tsx — The shape of a description, editable without a release.
//
// The predecessor froze one organisation's nine-section Feature template into a
// source module and threaded it through prompt text, reply normalisation and the
// commit diff. Changing a heading meant a release, so nobody changed one, so the
// template stopped describing how the team actually wrote issues.
//
// Here it is a list somebody edits. The nine shipped sections are seed values,
// not rules, and an empty list is a real choice: it means the description has no
// imposed structure.
//
// The guidance beside each heading is not decoration. It is stated to the
// assistant, so a heading with a vague line under it produces a vague section.

import type { JSX } from "react";

import { useState } from "react";

import { SEED_DESCRIPTION_SECTIONS } from "@jira-plus/core";
import type { DescriptionSection, WorkspaceConfiguration } from "@jira-plus/core";

/** What the panel needs. */
export interface SectionTemplatePanelProps {
  readonly configuration: WorkspaceConfiguration;
  readonly onSave: (configuration: WorkspaceConfiguration) => Promise<void>;
}

/** Moves one section, or returns the list unchanged at either end. */
function moveSection(
  sections: readonly DescriptionSection[],
  index: number,
  offset: number,
): readonly DescriptionSection[] {
  const target = index + offset;
  if (target < 0 || target >= sections.length) return sections;

  const reordered = [...sections];
  const [moved] = reordered.splice(index, 1);
  if (moved === undefined) return sections;
  reordered.splice(target, 0, moved);
  return reordered;
}

/** The template surface. */
export function SectionTemplatePanel({
  configuration,
  onSave,
}: SectionTemplatePanelProps): JSX.Element {
  // Defaulted, not assumed. A document written before this field existed has
  // no list at all, and mapping over the absence rendered nothing — the whole
  // Setup page went blank, with a blank page as its only symptom. The backfill
  // in the engine is the real fix; this is so no future field can do it again.
  const [sections, setSections] = useState<readonly DescriptionSection[]>(
    configuration.descriptionSections ?? [],
  );
  const [wasSaved, setWasSaved] = useState(false);

  /** Applies a change locally. Nothing is stored until Save. */
  function change(next: readonly DescriptionSection[]): void {
    setSections(next);
    setWasSaved(false);
  }

  /** Stores the template. The next prompt uses it. */
  async function save(): Promise<void> {
    await onSave({ ...configuration, descriptionSections: sections });
    setWasSaved(true);
  }

  return (
    <section className="setup__template">
      <h2 className="view__title">How a description is structured</h2>
      <p className="view__lede">
        These sections shape what the assistant is asked for, and what an authored description
        contains. They are yours to change — no new version of Jira+ is needed.
      </p>

      {sections.length === 0 ? (
        <p className="notice notice--attn">
          <strong>No sections.</strong> That is a valid choice: descriptions will be free-form prose
          with no imposed structure.
        </p>
      ) : null}

      <ol className="template__list">
        {sections.map((section, index) => (
          <li key={`${section.heading}-${index}`} className="template__row">
            <div className="template__fields">
              <label className="console__label" htmlFor={`section-heading-${index}`}>
                Heading
              </label>
              <input
                id={`section-heading-${index}`}
                className="console__jql"
                value={section.heading}
                onChange={(event) =>
                  change(
                    sections.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, heading: event.target.value }
                        : candidate,
                    ),
                  )
                }
              />

              <label className="console__label" htmlFor={`section-guidance-${index}`}>
                What belongs in it
              </label>
              <input
                id={`section-guidance-${index}`}
                className="console__jql"
                value={section.guidance}
                placeholder="Stated to the assistant, so vague here means vague there"
                onChange={(event) =>
                  change(
                    sections.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, guidance: event.target.value }
                        : candidate,
                    ),
                  )
                }
              />
            </div>

            <div className="template__actions">
              <button
                type="button"
                className="button"
                aria-label={`Move ${section.heading} up`}
                disabled={index === 0}
                onClick={() => change(moveSection(sections, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="button"
                aria-label={`Move ${section.heading} down`}
                disabled={index === sections.length - 1}
                onClick={() => change(moveSection(sections, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="button"
                aria-label={`Remove ${section.heading}`}
                onClick={() =>
                  change(sections.filter((unused, candidateIndex) => candidateIndex !== index))
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="console__actions">
        <button
          type="button"
          className="button"
          onClick={() => change([...sections, { heading: "New section", guidance: "" }])}
        >
          Add a section
        </button>
        <button
          type="button"
          className="button"
          onClick={() => change(SEED_DESCRIPTION_SECTIONS)}
        >
          Back to the nine it shipped with
        </button>
        <button type="button" className="button button--primary" onClick={() => void save()}>
          Save the template
        </button>
      </div>

      {wasSaved ? (
        <p className="notice notice--pass">
          Saved. The next prompt asks for exactly these sections, in this order.
        </p>
      ) : null}

      <p className="chart__note">
        Changing this does not change any number, so it does not change the configuration fingerprint
        in the header — that exists so two people disputing a figure can compare eight characters.
      </p>
    </section>
  );
}
