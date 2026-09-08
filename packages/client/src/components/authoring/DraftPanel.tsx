// DraftPanel.tsx — The issue itself.
//
// Four boxes, and the last one is not a Jira field. "Your own words" is kept
// with the draft to steer the assistant and to remind the operator what they
// meant a week later. It has no field id, so there is nowhere for it to reach
// Jira even by accident.

import type { JSX } from "react";

import type { AuthoringDraft } from "@jira-plus/core";

/** What the panel needs. */
export interface DraftPanelProps {
  readonly draft: AuthoringDraft;
  readonly onChange: (change: Partial<AuthoringDraft>) => void;
}

/** The writing surface. */
export function DraftPanel({ draft, onChange }: DraftPanelProps): JSX.Element {
  return (
    <section className="authoring__draft">
      <h3 className="authoring__panel-title">The issue</h3>

      <div className="console__form">
        <label className="console__label" htmlFor="draft-summary">
          Summary
        </label>
        <input
          id="draft-summary"
          className="console__jql"
          value={draft.summary}
          placeholder="One line somebody could recognise this by"
          onChange={(event) => onChange({ summary: event.target.value })}
        />

        <label className="console__label" htmlFor="draft-description">
          Description
        </label>
        <textarea
          id="draft-description"
          className="console__jql"
          rows={12}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />

        <label className="console__label" htmlFor="draft-criteria">
          Acceptance criteria
        </label>
        <textarea
          id="draft-criteria"
          className="console__jql"
          rows={5}
          value={draft.acceptanceCriteria}
          placeholder="Things a tester could check without asking a question"
          onChange={(event) => onChange({ acceptanceCriteria: event.target.value })}
        />

        <label className="console__label" htmlFor="draft-narrative">
          Your own words about this
        </label>
        <textarea
          id="draft-narrative"
          className="console__jql"
          rows={4}
          value={draft.operatorNarrative}
          placeholder="Explain it as you would to a colleague."
          onChange={(event) => onChange({ operatorNarrative: event.target.value })}
        />
        <p className="chart__note">
          Kept with your draft and never written to Jira. It is what steers the assistant, and what
          reminds you in a month what you actually meant.
        </p>
      </div>
    </section>
  );
}
