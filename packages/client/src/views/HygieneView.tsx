// HygieneView.tsx — Checks that report N of M, and say so when they cannot run.
//
// Every tile here is a Measure, so none of them can render a passing result from
// data that never arrived. An unconfigured field produces an explicit
// "can't be measured", never a green zero.

import type { JSX } from "react";

import type { ConceptId, WorkspaceConfiguration } from "@jira-plus/core";
import { CONCEPT_DESCRIPTIONS } from "@jira-plus/core";

import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import type { IssueSetState } from "../state/useIssueSet.js";

/** What the hygiene surface needs. */
export interface HygieneViewProps {
  readonly issueSetState: IssueSetState;
  readonly configuration: WorkspaceConfiguration | null;
}

/** Names every concept that still has no Jira field behind it. */
function listUnmappedConcepts(configuration: WorkspaceConfiguration | null): readonly string[] {
  if (configuration === null) return [];
  return (Object.keys(configuration.fieldMap) as ConceptId[])
    .filter((conceptId) => configuration.fieldMap[conceptId].state === "unmapped")
    .map((conceptId) => CONCEPT_DESCRIPTIONS[conceptId].label);
}

/** The hygiene surface. */
export function HygieneView({ issueSetState, configuration }: HygieneViewProps): JSX.Element {
  const { issueSet } = issueSetState;
  const unmappedConcepts = listUnmappedConcepts(configuration);

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

          {unmappedConcepts.length === 0 ? null : (
            <div className="notice">
              <p>
                {unmappedConcepts.length === 1
                  ? "One concept has"
                  : `${unmappedConcepts.length} concepts have`}{" "}
                no Jira field mapped yet: {unmappedConcepts.join(", ")}. Checks needing them report
                as not measurable rather than as passing.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
