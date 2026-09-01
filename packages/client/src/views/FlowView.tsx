// FlowView.tsx — Delivery evidence, under two definitions of finished.
//
// Nothing here reads a sprint. Every figure is reconstructed from what actually
// happened to each issue, which is why the numbers survive the move to Kanban —
// and why carry-over stops being able to hide the real rate.
//
// A retrieval without change history cannot produce any of these measures, and
// this surface says so rather than drawing an empty axis.

import type { JSX } from "react";

import type { WorkspaceConfiguration } from "@jira-plus/core";

import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import type { IssueSetState } from "../state/useIssueSet.js";

/** What the flow surface needs. */
export interface FlowViewProps {
  readonly issueSetState: IssueSetState;
  readonly configuration: WorkspaceConfiguration | null;
}

/** The flow surface. */
export function FlowView({ issueSetState, configuration }: FlowViewProps): JSX.Element {
  const { issueSet, lastJql, run } = issueSetState;
  const hasHistory = issueSet !== null && issueSet.record.changelogCoverage !== "none";

  return (
    <section>
      <h2 className="view__title">How the work actually flows</h2>
      <p className="view__lede">
        Completed items per week, how long each took, and what is ageing now — all read from each
        issue&apos;s own history. No sprint is involved in any of it.
      </p>

      {issueSet === null ? (
        <p className="console__empty">
          Run a query first. Flow measures read from the same retrieval as everything else.
        </p>
      ) : (
        <>
          <ProvenanceBanner record={issueSet.record} />

          {hasHistory ? (
            <p className="console__empty">
              History retrieved for {issueSet.issues.length.toLocaleString()} issues
              {configuration === null
                ? ""
                : `, under configuration ${issueSet.record.workspaceFingerprint}`}
              .
            </p>
          ) : (
            <div className="notice">
              <p>
                This retrieval did not include change history, so no flow measure can be computed.
                Nothing is shown rather than something being estimated.
              </p>
              <button
                type="button"
                className="button"
                onClick={() => void run(lastJql, { doesRequireChangelog: true })}
              >
                Retrieve again with history
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
