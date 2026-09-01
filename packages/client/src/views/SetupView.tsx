// SetupView.tsx — Confirm what the app is reading, by seeing your own data.
//
// The predecessor bound its story-points check to a hardcoded field id that was
// wrong for this instance. Forty-one pointed issues were reported unpointed, and
// accepted fixes wrote into a field nothing reads. Nothing on any screen said
// which field had been chosen.
//
// So Jira+ ships no default field id at all, proposes candidates without
// selecting one, and confirms a mapping by showing a real value from an issue
// the user names. A field id and a name can both look right while pointing at
// the wrong thing; a value somebody recognises cannot.

import type { JSX } from "react";

import { CONCEPT_DESCRIPTIONS } from "@jira-plus/core";
import type { ConceptId } from "@jira-plus/core";

import type { WorkspaceState } from "../state/useWorkspace.js";

/** What the setup surface needs. */
export interface SetupViewProps {
  readonly workspace: WorkspaceState;
}

/** How each mapping state reads on screen. Colour is never the only signal. */
const MAPPING_LABELS = {
  resolved: { label: "Confirmed", tone: "pass" },
  ambiguous: { label: "Several matches — choose one", tone: "attn" },
  unmapped: { label: "Not mapped yet", tone: "attn" },
  absent: { label: "Not on this Jira", tone: "na" },
} as const;

/** The setup surface. */
export function SetupView({ workspace }: SetupViewProps): JSX.Element {
  const { configuration, fingerprint, isLoading } = workspace;

  if (isLoading) return <p>Reading the configuration…</p>;
  if (configuration === null) {
    return <p className="notice notice--error">The configuration could not be read.</p>;
  }

  const conceptIds = Object.keys(configuration.fieldMap) as ConceptId[];

  return (
    <section>
      <h2 className="view__title">What this app is reading</h2>
      <p className="view__lede">
        Jira+ ships no assumptions about which field is which. Confirm each one by seeing a real
        value from one of your own issues.
      </p>

      <p className="setup__fingerprint mono">
        This configuration is <strong>{fingerprint}</strong>. It appears on every result and every
        export, so two people can tell whether they were configured the same way before they compare
        a number.
      </p>

      <ul className="setup__list">
        {conceptIds.map((conceptId) => {
          const entry = configuration.fieldMap[conceptId];
          const presentation = MAPPING_LABELS[entry.state];
          const detail =
            entry.state === "resolved"
              ? `${entry.fieldId} · ${entry.jiraName}`
              : `Jira may call it: ${CONCEPT_DESCRIPTIONS[conceptId].expectedJiraNames.join(" or ")}`;

          return (
            <li key={conceptId} className={`setup__row setup__row--${presentation.tone}`}>
              <div>
                <p className="setup__concept">{CONCEPT_DESCRIPTIONS[conceptId].label}</p>
                <p className="setup__detail mono">{detail}</p>
              </div>
              <span className={`chip chip--${presentation.tone}`}>{presentation.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
