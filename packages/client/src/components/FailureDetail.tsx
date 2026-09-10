// FailureDetail.tsx — The two halves that explain a refusal.
//
// "Can't you produce an error that would actually help us fix this?" Three fixes
// were aimed at plausible causes of one 400 before this existed, because the
// only thing on screen was the number. A status code cannot be diagnosed. What
// went out and what came back can.
//
// It stays closed until asked for. Somebody whose summary is too long needs the
// sentence saying so, not a JSON body; somebody working out why Jira refuses at
// all needs the body, and until now had nowhere to get it.

import type { JSX } from "react";

import { useState } from "react";

import type { FailureDiagnosis } from "@jira-plus/core";

/** How long the copy confirmation stays up. */
const COPIED_NOTICE_MS = 2000;

/** What the panel needs. */
export interface FailureDetailProps {
  readonly diagnosis: FailureDiagnosis | null | undefined;
}

/** The whole diagnosis as one block, shaped to be pasted into a bug report. */
function buildCopyText(diagnosis: FailureDiagnosis): string {
  return [
    `${diagnosis.sentMethod} ${diagnosis.sentPath}  (via ${diagnosis.sentVia || "unknown"})`,
    "",
    "Sent:",
    JSON.stringify(diagnosis.sentBody, null, 2),
    "",
    "Jira replied:",
    diagnosis.rawReply,
  ].join("\n");
}

/** The refusal, in full. */
export function FailureDetail({ diagnosis }: FailureDetailProps): JSX.Element | null {
  const [wasCopied, setWasCopied] = useState(false);

  if (diagnosis === null || diagnosis === undefined) return null;

  function copy(): void {
    if (diagnosis === null || diagnosis === undefined) return;
    void navigator.clipboard?.writeText(buildCopyText(diagnosis));
    setWasCopied(true);
    window.setTimeout(() => setWasCopied(false), COPIED_NOTICE_MS);
  }

  return (
    <details className="failure-detail">
      <summary>What was sent, and what Jira said back</summary>

      <p className="failure-detail__line">
        {diagnosis.sentMethod} {diagnosis.sentPath}
        {diagnosis.sentVia === "" ? null : ` — via the ${diagnosis.sentVia}`}
      </p>

      <h4 className="failure-detail__heading">Jira+ sent</h4>
      <pre className="failure-detail__body">{JSON.stringify(diagnosis.sentBody, null, 2)}</pre>

      <h4 className="failure-detail__heading">Jira replied</h4>
      <pre className="failure-detail__body">{diagnosis.rawReply}</pre>

      <div className="console__actions">
        <button type="button" className="button" onClick={copy}>
          {wasCopied ? "Copied" : "Copy all of it"}
        </button>
      </div>
    </details>
  );
}
