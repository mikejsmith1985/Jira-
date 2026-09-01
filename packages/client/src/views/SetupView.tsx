// SetupView.tsx — Confirm what the app is reading, by seeing your own data.
//
// The predecessor bound its story-points check to a hardcoded field id that was
// wrong for this instance. Forty-one pointed issues were reported unpointed, and
// accepted fixes wrote into a field nothing reads. Nothing on any screen said
// which field had been chosen, so it survived for months.
//
// So: no default ships, nothing is chosen automatically, and every candidate is
// shown with a REAL VALUE from an issue the user names. A field id and a name
// can both look right while pointing at the wrong thing; a value somebody
// recognises cannot.

import type { JSX } from "react";

import { useCallback, useEffect, useState } from "react";

import {
  clearFieldChoice,
  confirmConceptAbsent,
  confirmFieldChoice,
  createDataCenterAdapter,
  normaliseRawIssue,
  resolveFieldMap,
} from "@jira-plus/core";
import type {
  ConceptId,
  ConceptProposal,
  DetailedIssue,
  FieldCandidate,
  FieldMapResolution,
} from "@jira-plus/core";

import { createBrowserJiraTransport } from "../state/jiraTransport.js";
import type { WorkspaceState } from "../state/useWorkspace.js";

/** What the setup surface needs. */
export interface SetupViewProps {
  readonly workspace: WorkspaceState;
}

/** How each mapping state reads. Colour is never the only signal. */
const MAPPING_LABELS = {
  resolved: { label: "Confirmed", tone: "pass" },
  ambiguous: { label: "Several matches — choose one", tone: "attn" },
  unmapped: { label: "Not mapped yet", tone: "attn" },
  absent: { label: "Not on this Jira", tone: "na" },
} as const;

/** The setup surface. */
export function SetupView({ workspace }: SetupViewProps): JSX.Element {
  const { configuration, fingerprint, isLoading, save } = workspace;
  const [sampleIssueKey, setSampleIssueKey] = useState("");
  const [sampleIssue, setSampleIssue] = useState<DetailedIssue | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<FieldMapResolution | null>(null);

  const refreshProposals = useCallback(
    async (issue: DetailedIssue | null) => {
      if (configuration === null) return;
      const adapter = createDataCenterAdapter(createBrowserJiraTransport());
      setResolution(await resolveFieldMap(adapter, configuration.fieldMap, issue));
    },
    [configuration],
  );

  useEffect(() => {
    void refreshProposals(sampleIssue);
  }, [refreshProposals, sampleIssue]);

  /** Fetches the issue the user named, so candidates can show its real values. */
  async function loadSampleIssue(): Promise<void> {
    setSampleError(null);
    const adapter = createDataCenterAdapter(createBrowserJiraTransport());
    const response = await adapter.fetchIssueDetail(sampleIssueKey.trim(), {
      doesIncludeChangelog: false,
    });

    if (response.statusCode !== 200 || response.body === null) {
      setSampleIssue(null);
      setSampleError(
        response.jiraMessages[0] ??
          `Jira could not return ${sampleIssueKey} (status ${response.statusCode}).`,
      );
      return;
    }

    setSampleIssue(normaliseRawIssue(response.body, {}));
  }

  async function choose(conceptId: ConceptId, candidate: FieldCandidate): Promise<void> {
    if (configuration === null) return;
    await save({
      ...configuration,
      fieldMap: confirmFieldChoice(configuration.fieldMap, conceptId, candidate, new Date().toISOString()),
    });
  }

  async function markAbsent(conceptId: ConceptId): Promise<void> {
    if (configuration === null) return;
    await save({
      ...configuration,
      fieldMap: confirmConceptAbsent(configuration.fieldMap, conceptId, new Date().toISOString()),
    });
  }

  async function clear(conceptId: ConceptId): Promise<void> {
    if (configuration === null) return;
    await save({ ...configuration, fieldMap: clearFieldChoice(configuration.fieldMap, conceptId) });
  }

  if (isLoading) return <p>Reading the configuration…</p>;
  if (configuration === null) {
    return <p className="notice notice--error">The configuration could not be read.</p>;
  }

  return (
    <section>
      <h2 className="view__title">What this app is reading</h2>
      <p className="view__lede">
        Jira+ ships no assumptions about which field is which. Confirm each one by seeing a real
        value from one of your own issues.
      </p>

      <p className="setup__fingerprint mono">
        This configuration is <strong>{fingerprint}</strong>. It appears on every result and every
        export, so two people can tell whether they were configured the same way before they compare
        a number.
      </p>

      <div className="console__form">
        <label className="console__label" htmlFor="sample-key">
          An issue you know the values of
        </label>
        <div className="console__actions">
          <input
            id="sample-key"
            className="console__jql mono"
            value={sampleIssueKey}
            placeholder="ENCUC-1142"
            onChange={(event) => setSampleIssueKey(event.target.value)}
          />
          <button
            type="button"
            className="button"
            disabled={sampleIssueKey.trim().length === 0}
            onClick={() => void loadSampleIssue()}
          >
            Load it
          </button>
        </div>
        {sampleError === null ? null : <p className="notice notice--error">{sampleError}</p>}
        {sampleIssue === null ? (
          <p className="chart__note">
            Without a sample issue the candidates below show only their names and types. That is
            enough to guess with, and guessing is what this screen exists to replace.
          </p>
        ) : (
          <p className="chart__note">
            Showing values from {sampleIssue.key}. Pick the field whose value you recognise.
          </p>
        )}
      </div>

      {resolution?.status === "catalogue-unavailable" ? (
        <p className="notice notice--error">{resolution.reason}</p>
      ) : null}

      <ul className="setup__list">
        {(resolution?.status === "resolved" ? resolution.proposals : []).map(
          (proposal: ConceptProposal) => {
            const presentation = MAPPING_LABELS[proposal.currentEntry.state];
            return (
              <li key={proposal.conceptId} className={`setup__row setup__row--${presentation.tone}`}>
                <div className="setup__body">
                  <p className="setup__concept">{proposal.label}</p>

                  {proposal.currentEntry.state === "resolved" ? (
                    <p className="setup__detail mono">
                      {proposal.currentEntry.fieldId} · {proposal.currentEntry.jiraName}
                    </p>
                  ) : null}

                  {proposal.candidates.length === 0 ? (
                    <p className="setup__detail">
                      No field on this Jira has a matching name. Either it is called something else
                      here, or this instance does not have one.
                    </p>
                  ) : (
                    <ul className="setup__candidates">
                      {proposal.candidates.map((candidate) => (
                        <li key={candidate.fieldId} className="setup__candidate">
                          <div>
                            <span className="mono">{candidate.fieldId}</span> · {candidate.jiraName}{" "}
                            <span className="chip">{candidate.schemaType}</span>
                            <p className="setup__sample mono">
                              {candidate.sampleValue === null
                                ? sampleIssue === null
                                  ? "load an issue above to see its value"
                                  : `empty on ${sampleIssue.key}`
                                : `On ${sampleIssue?.key}: ${candidate.sampleValue}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="button"
                            onClick={() => void choose(proposal.conceptId, candidate)}
                          >
                            Use this one
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="setup__actions">
                  <span className={`chip chip--${presentation.tone}`}>{presentation.label}</span>
                  {proposal.currentEntry.state === "unmapped" ? (
                    <button
                      type="button"
                      className="tile__population"
                      onClick={() => void markAbsent(proposal.conceptId)}
                    >
                      Not on this Jira
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tile__population"
                      onClick={() => void clear(proposal.conceptId)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </li>
            );
          },
        )}
      </ul>
    </section>
  );
}
