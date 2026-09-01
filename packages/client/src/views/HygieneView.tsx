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
  buildJiraSearchUrl,
  createDataCenterAdapter,
  runChecks,
  summariseChecks,
} from "@jira-plus/core";
import type { CheckResult, JiraFieldDescriptor, WorkspaceConfiguration } from "@jira-plus/core";

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

          {drillThrough === null ? null : (
            <section className="drill">
              <div className="drill__head">
                <h3 className="chart__title">{drillThrough.title}</h3>
                <button type="button" className="tile__population" onClick={() => setDrillThrough(null)}>
                  Close
                </button>
              </div>

              <p className="chart__note tabular">
                {drillThrough.issueKeys.length} issue
                {drillThrough.issueKeys.length === 1 ? "" : "s"} — this list IS the number above,
                so they cannot disagree.
              </p>

              {drillThrough.jql === null || jiraBaseUrl.length === 0 ? null : (
                <p>
                  <a
                    className="drill__link"
                    href={buildJiraSearchUrl(jiraBaseUrl, drillThrough.jql)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open these in Jira ↗
                  </a>
                </p>
              )}

              <ul className="drill__keys">
                {drillThrough.issueKeys.map((issueKey) => (
                  <li key={issueKey} className="mono">
                    {jiraBaseUrl.length === 0 ? (
                      issueKey
                    ) : (
                      <a href={`${jiraBaseUrl}/browse/${issueKey}`} target="_blank" rel="noreferrer">
                        {issueKey}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
