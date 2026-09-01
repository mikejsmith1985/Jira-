// HygieneFixPanel.tsx — Fixes that need no prompt written.
//
// The fastest route to somebody using the tool without authoring anything, which
// matters more than it sounds: the predecessor put its AI features behind a
// keyboard shortcut and a passphrase, and friction on a tool with an adoption
// problem costs more than it protects.
//
// A one-click fix still produces the same reviewable diff as an assistant
// proposal. There is no faster path that skips the review, because "it was
// obvious" is how a batch of unwanted writes gets made.

import type { JSX } from "react";

import { findFixForCheck } from "@jira-plus/core";
import type { CheckResult } from "@jira-plus/core";

/** What the panel needs. */
export interface HygieneFixPanelProps {
  readonly results: readonly CheckResult[];
  readonly fixVersionName: string;
  readonly onFixVersionNameChange: (versionName: string) => void;
  readonly onPrepareFix: (result: CheckResult) => void;
}

/** How many issues a check flagged, or zero when it could not be measured. */
function readFlaggedCount(result: CheckResult): number {
  return result.measure.state === "measured" ? result.measure.flaggedKeys.length : 0;
}

/** The one-click fix panel. */
export function HygieneFixPanel({
  results,
  fixVersionName,
  onFixVersionNameChange,
  onPrepareFix,
}: HygieneFixPanelProps): JSX.Element | null {
  const fixable = results.filter(
    (result) => findFixForCheck(result) !== undefined && readFlaggedCount(result) > 0,
  );

  if (fixable.length === 0) return null;

  return (
    <section className="fixes">
      <h3 className="chart__title">Fix without writing a prompt</h3>
      <p className="chart__note">
        These need no assistant. They produce the same reviewable diff, because &ldquo;it was
        obvious&rdquo; is how a batch of unwanted writes gets made.
      </p>

      <div className="console__actions">
        <input
          className="console__jql mono"
          value={fixVersionName}
          placeholder="Which fix version? e.g. 2026.09"
          aria-label="Fix version to set"
          onChange={(event) => onFixVersionNameChange(event.target.value)}
        />
      </div>

      <div className="evidence__actions">
        {fixable.map((result) => {
          const fix = findFixForCheck(result);
          const flaggedCount = readFlaggedCount(result);
          if (fix === undefined) return null;

          return (
            <button
              key={fix.fixId}
              type="button"
              className="button"
              disabled={fixVersionName.trim().length === 0}
              onClick={() => onPrepareFix(result)}
              title={fix.describe(flaggedCount)}
            >
              {fix.title} on {flaggedCount} issue{flaggedCount === 1 ? "" : "s"}
            </button>
          );
        })}
      </div>
    </section>
  );
}
