// AuthorView.tsx — Write an issue with the material in front of you.
//
// Two columns, no wizard. Left is what you are writing from; right is what you
// are writing. The predecessor made this a six-step wizard across 2,880 lines
// and the material was never on screen at the same time as the draft, which is
// the one thing that would have helped.
//
// Nothing reaches Jira without the change appearing first, field by field, old
// value beside new. That is the product's existing rule and this screen is not
// the exception to it.

import type { JSX } from "react";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  assessDraftReadiness,
  buildAuthoringChangeSet,
  buildCreateScreenShape,
  createDataCenterAdapter,
  describeLoadFailure,
  describeUnavailableShape,
  isEnrichingExistingIssue,
  loadIssueIntoDraft,
  readDraftFieldValues,
  readLoadResult,
  runApplyPlan,
} from "@jira-plus/core";
import type {
  ApplyOutcome,
  AuthoringProposal,
  ChangeSet,
  PlannedChange,
  CreateScreenShape,
  IssueTypeChoice,
  WorkspaceConfiguration,
} from "@jira-plus/core";

import { ChangeDiffTable } from "../components/ChangeDiffTable.js";
import { AssistantPanel } from "../components/authoring/AssistantPanel.js";
import { ReadinessPanel } from "../components/authoring/ReadinessPanel.js";
import { CreateTargetPanel } from "../components/authoring/CreateTargetPanel.js";
import { DraftPanel } from "../components/authoring/DraftPanel.js";
import { SourcesPanel } from "../components/authoring/SourcesPanel.js";
import { createBrowserJiraTransport } from "../state/jiraTransport.js";
import { useAuthoringDraft } from "../state/useAuthoringDraft.js";

/** Jira's own ids for the two fields every issue has. */
const SUMMARY_FIELD_ID = "summary";
const DESCRIPTION_FIELD_ID = "description";

/** What the surface needs. */
export interface AuthorViewProps {
  readonly configuration: WorkspaceConfiguration | null;
  readonly jiraBaseUrl: string;
}

/** The authoring surface. */
export function AuthorView({ configuration, jiraBaseUrl }: AuthorViewProps): JSX.Element {
  const { draft, isLoading, update, replace, discard } = useAuthoringDraft();
  const [issueTypes, setIssueTypes] = useState<readonly IssueTypeChoice[]>([]);
  const [shape, setShape] = useState<CreateScreenShape | null>(null);
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);

  const isEnriching = isEnrichingExistingIssue(draft);

  /** The concept the field map resolves to this instance's criteria field. */
  const acceptanceCriteriaFieldId =
    configuration?.fieldMap.acceptanceCriteria.state === "resolved"
      ? configuration.fieldMap.acceptanceCriteria.fieldId
      : null;

  /**
   * Brings an existing issue in.
   *
   * Deliberately not automatic on typing: half a key is not a key, and asking
   * Jira about ENCUC-11 while somebody is on their way to ENCUC-1142 produces a
   * confident wrong answer about an issue they did not mean.
   */
  async function loadIssue(): Promise<void> {
    const issueKey = (draft.existingIssueKey ?? "").trim();
    if (issueKey.length === 0) return;

    setIsLoadingIssue(true);
    setProblem(null);
    setChangeSet(null);
    try {
      const adapter = createDataCenterAdapter(createBrowserJiraTransport());
      const response = await adapter.fetchIssueDetail(issueKey, { doesIncludeChangelog: false });
      const result = readLoadResult({
        issueKey,
        statusCode: response.statusCode,
        rawIssue: (response.body as Record<string, unknown> | null) ?? null,
        jiraMessages: response.jiraMessages,
      });

      if (result.status === "failed") {
        // Stays in create mode rather than offering to update nothing.
        setProblem(describeLoadFailure(result.failure));
        update({ existingIssueKey: null });
        return;
      }

      replace(
        loadIssueIntoDraft({
          draft,
          issue: result.issue,
          summaryFieldId: SUMMARY_FIELD_ID,
          descriptionFieldId: DESCRIPTION_FIELD_ID,
          acceptanceCriteriaFieldId,
          nowIso: new Date().toISOString(),
        }),
      );
    } finally {
      setIsLoadingIssue(false);
    }
  }

  /** Asks the instance which issue types this project offers. */
  useEffect(() => {
    if (draft.projectKey.trim().length === 0 || isEnriching) {
      setIssueTypes([]);
      return;
    }
    void (async () => {
      const adapter = createDataCenterAdapter(createBrowserJiraTransport());
      const response = await adapter.fetchIssueTypesForProject(draft.projectKey);
      setIssueTypes(response.body ?? []);
    })();
  }, [draft.projectKey, isEnriching]);

  /** Asks the instance what this issue type's create screen offers. */
  useEffect(() => {
    if (draft.projectKey.trim().length === 0 || draft.issueTypeId.trim().length === 0) {
      setShape(null);
      return;
    }
    void (async () => {
      const adapter = createDataCenterAdapter(createBrowserJiraTransport());
      const response = await adapter.fetchCreateScreenFields(draft.projectKey, draft.issueTypeId);
      // An empty field list and a failed read are different states and must not
      // render alike: one means the type has no fields, the other means we do
      // not know what it has.
      setShape(
        response.body === null
          ? describeUnavailableShape(
              response.jiraMessages[0] ?? `Jira answered with status ${response.statusCode}.`,
            )
          : buildCreateScreenShape({
              projectKey: draft.projectKey,
              issueTypeId: draft.issueTypeId,
              rawFields: response.body,
            }),
      );
    })();
  }, [draft.projectKey, draft.issueTypeId]);

  /** Everything this draft would write, keyed by the instance's own field ids. */
  const readValues = useCallback(
    () =>
      readDraftFieldValues(draft, SUMMARY_FIELD_ID, DESCRIPTION_FIELD_ID, acceptanceCriteriaFieldId),
    [draft, acceptanceCriteriaFieldId],
  );

  /**
   * The advisory assessment of the draft.
   *
   * Recomputed as the draft changes, and never allowed to block anything: its
   * type is not a blocker, so no code path could make it one.
   */
  const readiness = useMemo(() => {
    if (configuration === null) return null;
    return assessDraftReadiness({
      draft,
      configuration,
      acceptanceCriteriaFieldId,
      issueTypeName: issueTypes.find((type) => type.issueTypeId === draft.issueTypeId)?.name ?? "",
      nowIso: new Date().toISOString(),
    });
  }, [draft, configuration, acceptanceCriteriaFieldId, issueTypes]);

  /** Works out what would change, and shows it. Sends nothing. */
  function review(): void {
    setOutcome(null);
    setCreatedKey(null);
    setSavedKey(null);
    setProblem(null);
    setChangeSet(
      buildAuthoringChangeSet({
        draft,
        shape: shape ?? describeUnavailableShape("No issue type has been chosen yet."),
        values: readValues(),
      }),
    );
  }

  /**
   * Writes the draft: creates a new issue, or saves changes to the loaded one.
   *
   * Which of the two happens is decided by the same single field the change set
   * reads, so the button and the behaviour cannot disagree. Reached only through
   * the diff, so every field has been seen. The draft is discarded ONLY on full
   * success — a write that failed must not also take the work with it.
   */
  async function write(accepted: readonly PlannedChange[]): Promise<void> {
    setProblem(null);

    if (isEnriching) {
      // Per-field writes through the shipped pipeline: each succeeds or fails
      // independently, reports Jira's own words, and reaches the journal.
      const applied = await runApplyPlan(
        { plannedChanges: accepted, blockers: [], unchangedCount: 0 },
        createBrowserJiraTransport(),
      );
      setOutcome(applied);
      if (applied.failedCount === 0 && applied.refusedReason === null) {
        setSavedKey(draft.existingIssueKey);
        await discard();
      }
      return;
    }

    const adapter = createDataCenterAdapter(createBrowserJiraTransport());
    const response = await adapter.createIssue({
      fields: {
        project: { key: draft.projectKey },
        issuetype: { id: draft.issueTypeId },
        ...readValues(),
      },
    });

    if (response.body === null) {
      const reason =
        response.jiraMessages.join(" ") || `Jira answered with status ${response.statusCode}.`;
      setOutcome({
        results: accepted.map((change) => ({
          issueKey: change.issueKey,
          fieldId: change.fieldId,
          fieldLabel: change.fieldLabel,
          status: "failed" as const,
          message: reason,
        })),
        appliedCount: 0,
        failedCount: accepted.length,
        refusedReason: null,
      });
      return;
    }

    const issueKey = response.body.key;
    setCreatedKey(issueKey);
    setOutcome({
      results: accepted.map((change) => ({
        issueKey,
        fieldId: change.fieldId,
        fieldLabel: change.fieldLabel,
        status: "applied" as const,
      })),
      appliedCount: accepted.length,
      failedCount: 0,
      refusedReason: null,
    });
    await discard();
  }

  /**
   * Puts an accepted proposal into the draft.
   *
   * The draft, and nowhere else. A proposal the operator does not accept lands
   * nowhere at all, and even an accepted one reaches Jira only through the
   * create or save they press afterwards.
   */
  function acceptProposal(proposal: AuthoringProposal): void {
    update({
      summary: proposal.summary ?? draft.summary,
      description: proposal.description ?? draft.description,
      acceptanceCriteria: proposal.acceptanceCriteria ?? draft.acceptanceCriteria,
      fieldValues: { ...draft.fieldValues, ...proposal.fieldValues },
    });
    setChangeSet(null);
  }

  if (isLoading) return <p>Reading your draft…</p>;

  return (
    <section>
      <h2 className="view__title">Write an issue</h2>
      <p className="view__lede">
        Gather what you are writing from on the left, write it on the right. Nothing reaches Jira
        until you have seen exactly what will change.
      </p>

      {createdKey === null ? null : (
        <p className="notice notice--pass">
          <strong>Created {createdKey}.</strong>{" "}
          {jiraBaseUrl === "" ? null : (
            <a href={`${jiraBaseUrl}/browse/${createdKey}`} target="_blank" rel="noreferrer">
              Open it in Jira
            </a>
          )}
        </p>
      )}
      {savedKey === null ? null : (
        <p className="notice notice--pass">
          <strong>Saved to {savedKey}.</strong> No second issue was created.{" "}
          {jiraBaseUrl === "" ? null : (
            <a href={`${jiraBaseUrl}/browse/${savedKey}`} target="_blank" rel="noreferrer">
              Open it in Jira
            </a>
          )}
        </p>
      )}
      {problem === null ? null : <p className="notice notice--error">{problem}</p>}

      <div className="authoring">
        <SourcesPanel draft={draft} onChange={replace} />

        <div className="authoring__right">
          <CreateTargetPanel
            draft={draft}
            issueTypes={issueTypes}
            shape={shape}
            isEnriching={isEnriching}
            onChange={update}
          />
          <DraftPanel draft={draft} onChange={update} />
        </div>
      </div>

      {readiness === null ? null : <ReadinessPanel assessment={readiness} />}

      <AssistantPanel
        draft={draft}
        shape={shape}
        sections={configuration?.descriptionSections ?? []}
        budgetCharacters={configuration?.transferBudgetCharacters ?? 18000}
        onAccept={acceptProposal}
      />

      <div className="console__actions">
        <button type="button" className="button" onClick={review}>
          Show me what will change
        </button>
        {isEnriching ? (
          <button
            type="button"
            className="button"
            disabled={isLoadingIssue}
            onClick={() => void loadIssue()}
          >
            {isLoadingIssue ? "Loading…" : `Load ${draft.existingIssueKey}`}
          </button>
        ) : null}
        <button type="button" className="button" onClick={() => void discard()}>
          Discard this draft
        </button>
      </div>

      {changeSet === null ? null : (
        <div className="authoring__review">
          {changeSet.blockers.length > 0 ? (
            <div className="notice notice--error">
              <p>
                <strong>Nothing will be written yet.</strong>
              </p>
              <ul>
                {changeSet.blockers.map((blocker) => (
                  <li key={blocker.reason}>{blocker.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <ChangeDiffTable
            changeSet={changeSet}
            outcome={outcome}
            onApply={write}
            onDismiss={() => {
              setChangeSet(null);
              setOutcome(null);
            }}
          />
        </div>
      )}

    </section>
  );
}
