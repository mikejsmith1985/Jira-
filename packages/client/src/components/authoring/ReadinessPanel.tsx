// ReadinessPanel.tsx — Advice that is visibly not a refusal.
//
// A readiness finding says the draft could be better. A blocker says Jira will
// refuse it. Rendering those the same way makes people ignore both: advice that
// looks like a refusal trains somebody to dismiss real refusals, and a real
// refusal that looks like advice gets dismissed.
//
// So this panel never uses the error tone, never disables anything, and says in
// words that it will not stop a write. The blockers live with the diff, in red,
// where they belong.

import type { JSX } from "react";

import type { ReadinessAssessment } from "@jira-plus/core";

/** What the panel needs. */
export interface ReadinessPanelProps {
  readonly assessment: ReadinessAssessment;
}

/** The advisory surface. */
export function ReadinessPanel({ assessment }: ReadinessPanelProps): JSX.Element | null {
  const hasNothingToSay =
    assessment.findings.length === 0 && assessment.unassessed.length === 0;
  if (hasNothingToSay) return null;

  return (
    <section className="authoring__readiness">
      <h3 className="authoring__panel-title">Worth a look before you write it</h3>
      <p className="chart__note">
        Advice, not a gate. None of this stops you creating or saving — the reasons a write is
        actually refused appear with the diff, in red.
      </p>

      {assessment.findings.length === 0 ? null : (
        <ul className="readiness__list">
          {assessment.findings.map((finding) => (
            <li key={finding.checkId} className="readiness__item">
              <strong>{finding.title}</strong>
              <p className="chart__note">{finding.whyItMatters}</p>
            </li>
          ))}
        </ul>
      )}

      {assessment.unassessed.length === 0 ? null : (
        <div className="readiness__unassessed">
          <p className="chart__note">
            These could not be assessed at all. That is not the same as passing them.
          </p>
          <ul className="readiness__list">
            {assessment.unassessed.map((check) => (
              <li key={check.checkId} className="readiness__item readiness__item--unassessed">
                <strong>{check.title}</strong>
                <p className="chart__note">{check.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
