// DeliveryEvidencePanel.tsx — The thing you hand to somebody who doubts you.
//
// The persuasive artifact is not the charts above it. It is this: the figures,
// then every issue key behind them, then the exact query, then the query that
// reproduces the headline number in Jira without this tool.
//
// The claim stops being "trust our velocity" and becomes "here is the query,
// check it yourself" — which is a different kind of claim, and the only one
// worth making to somebody who has been shown a chart before.

import type { JSX } from "react";

import { useState } from "react";

import { renderDeliveryEvidenceMarkdown } from "@jira-plus/core";
import type { DeliveryEvidenceDocument } from "@jira-plus/core";

/** Copies text, tolerating a browser that refuses clipboard access. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The document is on screen and selectable, so there is nothing to recover.
  }
}

/** What the panel needs. */
export interface DeliveryEvidencePanelProps {
  readonly evidence: DeliveryEvidenceDocument;
}

/** The exportable evidence document. */
export function DeliveryEvidencePanel({ evidence }: DeliveryEvidencePanelProps): JSX.Element {
  const [isDocumentOpen, setIsDocumentOpen] = useState(false);

  return (
    <section className="evidence">
      <div className="receipt">
        <span className="receipt__lead tabular">
          {evidence.completedCount} items · median {evidence.medianCycleTimeDays.toFixed(1)}d · 85th{" "}
          {evidence.eightyFifthPercentileDays.toFixed(1)}d
        </span>
        <button
          type="button"
          className="receipt__copy"
          onClick={() => void copyToClipboard(evidence.verifyingJql)}
        >
          How do I check this?
        </button>
        <p className="receipt__note">
          That button copies a Jira query which returns exactly these items. Somebody can run it
          without this tool, and without you in the room.
        </p>
      </div>

      <div className="evidence__actions">
        <button
          type="button"
          className="button"
          onClick={() => void copyToClipboard(renderDeliveryEvidenceMarkdown(evidence))}
        >
          Copy delivery evidence
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setIsDocumentOpen((wasOpen) => !wasOpen)}
        >
          {isDocumentOpen ? "Hide" : "Show"} the document
        </button>
      </div>

      {isDocumentOpen ? (
        <pre className="evidence__document mono">{renderDeliveryEvidenceMarkdown(evidence)}</pre>
      ) : null}
    </section>
  );
}
