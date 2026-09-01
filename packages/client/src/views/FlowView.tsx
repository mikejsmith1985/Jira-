// FlowView.tsx — Delivery evidence, under two definitions of finished.
//
// Nothing here reads a sprint. Every figure comes from what actually happened to
// each issue, which is why the numbers survive the move to Kanban — and why
// carry-over stops being able to hide the real rate.
//
// The lens switch recomputes all six measures together, so there is no state in
// which one chart is drawn under one definition and another under a different
// one. And the button that matters most is "How do I check this?", which hands
// over a Jira query that reproduces the headline count without this tool.

import type { JSX } from "react";

import { useMemo, useState } from "react";

import {
  buildDeliveryEvidence,
  buildFlowFacts,
  computeAgingWork,
  computeCycleTime,
  computeHolderTotals,
  computeThroughput,
  describeLens,
  findLensContradictions,
  renderDeliveryEvidenceMarkdown,
  resolveLens,
} from "@jira-plus/core";
import type { CompletionLensId, WorkspaceConfiguration } from "@jira-plus/core";

import { MeasurementTile } from "../components/MeasurementTile.js";
import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import { ThroughputChart } from "../components/charts/ThroughputChart.js";
import { CycleTimeChart } from "../components/charts/CycleTimeChart.js";
import { AgingChart } from "../components/charts/AgingChart.js";
import type { IssueSetState } from "../state/useIssueSet.js";

/** How far back per-person attribution looks, in milliseconds. */
const ATTRIBUTION_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/** The two lenses, in the order they are offered. */
const LENS_OPTIONS: readonly { readonly lensId: CompletionLensId; readonly label: string }[] = [
  { lensId: "delivered-to-int", label: "Delivered to INT" },
  { lensId: "released-to-prod", label: "Released to prod" },
];

/** Copies text, tolerating a browser that refuses clipboard access. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The text is on screen and selectable, so there is nothing to recover.
  }
}

/** What the flow surface needs. */
export interface FlowViewProps {
  readonly issueSetState: IssueSetState;
  readonly configuration: WorkspaceConfiguration | null;
}

/** The flow surface. */
export function FlowView({ issueSetState, configuration }: FlowViewProps): JSX.Element {
  const [activeLensId, setActiveLensId] = useState<CompletionLensId>("delivered-to-int");
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const { issueSet, lastJql, run } = issueSetState;

  const hasHistory = issueSet !== null && issueSet.record.changelogCoverage !== "none";

  // Every measure descends from this one computation, so switching the lens
  // moves all of them together and a mixed-lens screen is unreachable.
  const analysis = useMemo(() => {
    if (issueSet === null || configuration === null || !hasHistory) return null;

    const lens = resolveLens(activeLensId, configuration, issueSet.issues);
    const factSet = buildFlowFacts(issueSet, lens, configuration.workingCalendar);
    const throughput = computeThroughput(factSet, issueSet);
    const cycleTime = computeCycleTime(factSet, issueSet);
    const aging = computeAgingWork(factSet, issueSet, cycleTime, Date.now());

    const bounds = {
      fromMs: Date.parse(issueSet.record.startedAtIso) - ATTRIBUTION_WINDOW_MS,
      toMs: Date.parse(issueSet.record.startedAtIso),
    };
    const holderTotals = computeHolderTotals(factSet, bounds);

    const otherLens = resolveLens(
      activeLensId === "delivered-to-int" ? "released-to-prod" : "delivered-to-int",
      configuration,
      issueSet.issues,
    );
    const otherFacts = buildFlowFacts(issueSet, otherLens, configuration.workingCalendar);
    const deliveredKeys = new Set(
      (activeLensId === "delivered-to-int" ? factSet : otherFacts).facts
        .filter((fact) => fact.completedMs !== null)
        .map((fact) => fact.issue.key),
    );
    const releasedKeys = new Set(
      (activeLensId === "released-to-prod" ? factSet : otherFacts).facts
        .filter((fact) => fact.completedMs !== null)
        .map((fact) => fact.issue.key),
    );

    return {
      lens,
      factSet,
      throughput,
      cycleTime,
      aging,
      holderTotals,
      contradictions: findLensContradictions({ deliveredKeys, releasedKeys }),
    };
  }, [issueSet, configuration, activeLensId, hasHistory]);

  const evidence = useMemo(() => {
    if (analysis === null || issueSet === null || configuration === null) return null;
    return buildDeliveryEvidence({
      issueSet,
      factSet: analysis.factSet,
      lens: analysis.lens,
      throughput: analysis.throughput,
      cycleTime: analysis.cycleTime,
      configuration,
      generatedAtIso: new Date().toISOString(),
    });
  }, [analysis, issueSet, configuration]);

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

          {hasHistory ? null : (
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

          {analysis === null ? null : (
            <>
              <div className="lenses" role="group" aria-label="What counts as finished">
                {LENS_OPTIONS.map((option) => (
                  <button
                    key={option.lensId}
                    type="button"
                    className="lens-btn"
                    aria-pressed={activeLensId === option.lensId}
                    onClick={() => setActiveLensId(option.lensId)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <p className="def-line">{describeLens(analysis.lens)}</p>

              {analysis.contradictions.length === 0 ? null : (
                <p className="notice notice--error" role="alert">
                  {analysis.contradictions.length} issues are counted as released to production but
                  never reached integration test: {analysis.contradictions.join(", ")}. That cannot
                  both be true, so this is a data or configuration fault rather than a result.
                </p>
              )}

              {analysis.factSet.excludedKeys.length === 0 ? null : (
                <p className="notice">
                  {analysis.factSet.excludedKeys.length} issues were excluded because their change
                  history was not available. They are not counted as unfinished; they are not
                  counted at all.
                </p>
              )}

              <div className="tiles">
                <MeasurementTile measure={analysis.throughput.completed} title="Items completed" />
                <MeasurementTile
                  measure={analysis.cycleTime.measured}
                  title="Items with a measurable duration"
                />
                <MeasurementTile
                  measure={analysis.aging.measured}
                  title="In progress longer than usual"
                />
              </div>

              <ThroughputChart weeks={analysis.throughput.weeks} />
              <CycleTimeChart
                points={analysis.cycleTime.points}
                percentiles={analysis.cycleTime.percentiles}
              />
              <AgingChart
                items={analysis.aging.items}
                thresholdDays={analysis.aging.eightyFifthPercentileDays}
              />

              {analysis.holderTotals.length === 0 ? null : (
                <>
                  <h3 className="chart__title">Who held the work</h3>
                  <p className="chart__note">
                    Credit is one issue divided by working time held, so these columns add up to the
                    team total. The touched count deliberately does not.
                  </p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Person</th>
                        <th scope="col">Credited issues</th>
                        <th scope="col">Issues touched (not additive)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.holderTotals.map((total) => (
                        <tr key={total.holderId}>
                          <td>{total.holderId.trim() === "unassigned" ? "Unassigned" : total.holderId}</td>
                          <td className="tabular">{total.creditedIssues.toFixed(2)}</td>
                          <td className="tabular">{total.touchedIssueCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {evidence === null ? null : (
                <section className="evidence">
                  <div className="receipt">
                    <span className="receipt__lead tabular">
                      {evidence.completedCount} items · median{" "}
                      {evidence.medianCycleTimeDays.toFixed(1)}d · 85th{" "}
                      {evidence.eightyFifthPercentileDays.toFixed(1)}d
                    </span>
                    <button
                      type="button"
                      className="receipt__copy"
                      onClick={() => void copyToClipboard(evidence.verifyingJql)}
                    >
                      How do I check this?
                    </button>
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
                      onClick={() => setIsEvidenceOpen((wasOpen) => !wasOpen)}
                    >
                      {isEvidenceOpen ? "Hide" : "Show"} the document
                    </button>
                  </div>

                  {isEvidenceOpen ? (
                    <pre className="evidence__document mono">
                      {renderDeliveryEvidenceMarkdown(evidence)}
                    </pre>
                  ) : null}
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
