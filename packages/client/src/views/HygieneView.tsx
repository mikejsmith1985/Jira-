// HygieneView.tsx — Checks that report N of M, and say so when they cannot run.
//
// This is the five-minute demonstration the product is sold on. Unmap a field
// and the tile that depends on it turns amber, naming the concept and offering a
// route to setup — while the check that needs no mapping keeps working. Put that
// beside the predecessor's green zero and the argument makes itself.
//
// Every number here opens to exactly the issues behind it, and every denominator
// opens to the population it was measured against, because a wrong denominator
// should be visible before the count is believed.

import type { JSX } from "react";

import { useEffect, useMemo, useState } from "react";

import {
  buildChangeSet,
  createDataCenterAdapter,
  findFixForCheck,
  runApplyPlan,
  runChecks,
  summariseChecks,
} from "@jira-plus/core";
import type {
  ApplyOutcome,
  ChangeSet,
  CheckResult,
  JiraFieldDescriptor,
  PlannedChange,
  WorkspaceConfiguration,
} from "@jira-plus/core";

import { ChangeDiffTable } from "../components/ChangeDiffTable.js";
import { HygieneFixPanel } from "../components/HygieneFixPanel.js";
import { IssueDrillThrough } from "../components/IssueDrillThrough.js";
import { MeasurementTile } from "../components/MeasurementTile.js";
import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import { WhyThisNumber } from "../components/WhyThisNumber.js";
import { createBrowserJiraTransport } from "../state/jiraTransport.js";
import type { IssueSetState } from "../state/useIssueSet.js";

/** What the hygiene surface needs. */
export interface HygieneViewProps {
  readonly issueSetState: IssueSetState;
  readonly configuration: WorkspaceConfiguration | null;
  readonly jiraBaseUrl: string;
}

/** A drill-through the user asked for: which issues, and why these. */
interface DrillThrough {
  readonly title: string;
  readonly issueKeys: readonly string[];
  readonly jql: string | null;
}

/** The hygiene surface. */
export function HygieneView({
  issueSetState,
  configuration,
  jiraBaseUrl,
}: HygieneViewProps): JSX.Element {
  const { issueSet } = issueSetState;
  const [fieldCatalogue, setFieldCatalogue] = useState<readonly JiraFieldDescriptor[]>([]);
  const [drillThrough, setDrillThrough] = useState<DrillThrough | null>(null);
  const [openExplanationId, setOpenExplanationId] = useState<string | null>(null);
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);
  const [applyOutcome, setApplyOutcome] = useState<ApplyOutcome | null>(null);
  const [fixVersionName, setFixVersionName] = useState("");

  // The catalogue lets a result name Jira's own label for whichever field it
  // read, which is what makes a mapping auditable rather than merely configured.
  useEffect(() => {
    let isStillMounted = true;
    void (async () => {
      const adapter = createDataCenterAdapter(createBrowserJiraTransport());
      const response = await adapter.fetchFieldCatalogue();
      if (isStillMounted && response.body !== null) setFieldCatalogue(response.body);
    })();
    return () => {
      isStillMounted = false;
    };
  }, []);

  const results = useMemo((): readonly CheckResult[] => {
    if (issueSet === null || configuration === null) return [];
    return runChecks(issueSet, configuration, fieldCatalogue);
  }, [issueSet, configuration, fieldCatalogue]);

  const summary = useMemo(() => summariseChecks(results), [results]);

  const notMeasurable = results.filter((result) => result.measure.state === "unresolved");

  /** Builds a reviewable change set from a one-click fix. Nothing is sent yet. */
  function prepareFix(result: CheckResult): void {
    const fix = findFixForCheck(result);
    if (fix === undefined || issueSet === null || configuration === null) return;
    if (result.measure.state !== "measured") return;

    const flaggedIssues = result.measure.flaggedKeys
      .map((issueKey) => issueSet.byKey.get(issueKey))
      .filter((issue): issue is NonNullable<typeof issue> => issue !== undefined);

    setApplyOutcome(null);
    setChangeSet(
      buildChangeSet({
        proposals: fix.buildProposals({
          issueSet,
          flaggedIssues,
          parameters: { versionName: fixVersionName },
        }),
        issueSet,
        fieldMap: configuration.fieldMap,
      }),
    );
  }

  /** Applies the reviewed plan. Every write passes the journal on the way out. */
  async function applyChanges(accepted: readonly PlannedChange[]): Promise<void> {
    if (changeSet === null) return;
    const outcome = await runApplyPlan(
      { ...changeSet, plannedChanges: accepted },
      createBrowserJiraTransport(),
    );
    setApplyOutcome(outcome);
  }

  return (
    <section>
      <h2 className="view__title">Hygiene you can argue with</h2>
      <p className="view__lede">
        Every check reads <em>N of M</em> — how many failed, out of how many it actually applies to.
        A check that cannot run says so; it never quietly turns green.
      </p>

      {issueSet === null ? (
        <p className="console__empty">Run a query first. Checks read from that one retrieval.</p>
      ) : (
        <>
          <ProvenanceBanner record={issueSet.record} />

          {summary.passRate === null ? (
            <p className="notice">
              Nothing could be measured over this retrieval, so there is no overall figure to show.
            </p>
          ) : (
            <p className="def-line">
              {summary.measuredCount} check{summary.measuredCount === 1 ? "" : "s"} ran over this
              set. {summary.flaggedIssueCount} issue
              {summary.flaggedIssueCount === 1 ? "" : "s"} were flagged by at least one of them.
              {summary.notMeasurableCount > 0
                ? ` ${summary.notMeasurableCount} could not be measured and are excluded from that.`
                : ""}
            </p>
          )}

          <div className="tiles">
            {results.map((result) => (
              <MeasurementTile
                key={result.check.checkId}
                measure={result.measure}
                title={result.check.title}
                onOpenFlagged={(issueKeys) =>
                  setDrillThrough({
                    title: `${result.check.title} — the ${issueKeys.length} flagged`,
                    issueKeys,
                    jql: result.drillThroughJql,
                  })
                }
                onOpenPopulation={(issueKeys) =>
                  setDrillThrough({
                    title: `${result.check.title} — the ${issueKeys.length} this applies to`,
                    issueKeys,
                    jql: null,
                  })
                }
              />
            ))}
          </div>

          {notMeasurable.length === 0 ? null : (
            <section className="not-measurable">
              <h3 className="chart__title">Not measurable here ({notMeasurable.length})</h3>
              <p className="chart__note">
                These are counted as neither passing nor failing, and are excluded from the figure
                above. That is the honest answer, not a zero.
              </p>
              <ul className="not-measurable__list">
                {notMeasurable.map((result) => (
                  <li key={result.check.checkId}>
                    <strong>{result.check.title}</strong> — {result.check.whyItMatters}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.map((result) =>
            openExplanationId === result.check.checkId ? (
              <WhyThisNumber
                key={`why-${result.check.checkId}`}
                measure={result.measure}
                resolvedFields={result.fieldsRead.map((field) => ({
                  conceptLabel: field.conceptId,
                  fieldId: field.fieldId,
                  jiraName: field.jiraName,
                }))}
              />
            ) : null,
          )}

          <div className="hygiene__explain">
            {results.map((result) => (
              <button
                key={`explain-${result.check.checkId}`}
                type="button"
                className="tile__population"
                onClick={() =>
                  setOpenExplanationId((current) =>
                    current === result.check.checkId ? null : result.check.checkId,
                  )
                }
              >
                {openExplanationId === result.check.checkId ? "Hide" : "Where does"} “
                {result.check.title}” {openExplanationId === result.check.checkId ? "" : "come from?"}
              </button>
            ))}
          </div>

          <HygieneFixPanel
            results={results}
            fixVersionName={fixVersionName}
            onFixVersionNameChange={setFixVersionName}
            onPrepareFix={prepareFix}
          />

          {changeSet === null ? null : (
            <ChangeDiffTable
              changeSet={changeSet}
              outcome={applyOutcome}
              onApply={applyChanges}
              onDismiss={() => {
                setChangeSet(null);
                setApplyOutcome(null);
              }}
            />
          )}

          {drillThrough === null ? null : (
            <IssueDrillThrough
              title={drillThrough.title}
              issueKeys={drillThrough.issueKeys}
              jql={drillThrough.jql}
              jiraBaseUrl={jiraBaseUrl}
              onClose={() => setDrillThrough(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
