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

import { useCallback, useEffect, useState } from "react";

import {
  buildAuthoringChangeSet,
  buildCreateScreenShape,
  createDataCenterAdapter,
  describeUnavailableShape,
  isEnrichingExistingIssue,
  readDraftFieldValues,
} from "@jira-plus/core";
import type {
  ApplyOutcome,
  ChangeSet,
  PlannedChange,
  CreateScreenShape,
  IssueTypeChoice,
  WorkspaceConfiguration,
} from "@jira-plus/core";

import { ChangeDiffTable } from "../components/ChangeDiffTable.js";
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
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const isEnriching = isEnrichingExistingIssue(draft);

  /** The concept the field map resolves to this instance's criteria field. */
  const acceptanceCriteriaFieldId =
    configuration?.fieldMap.acceptanceCriteria.state === "resolved"
      ? configuration.fieldMap.acceptanceCriteria.fieldId
      : null;

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

  /** Works out what would change, and shows it. Sends nothing. */
  function review(): void {
    setOutcome(null);
    setCreatedKey(null);
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
   * Creates the issue.
   *
   * Reached only through the diff, so every field that will be written has been
   * seen. The draft is discarded ONLY on full success — a create that failed
   * must not also take the work with it.
   */
  async function create(accepted: readonly PlannedChange[]): Promise<void> {
    setProblem(null);
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

      <div className="console__actions">
        <button type="button" className="button" onClick={review}>
          Show me what will change
        </button>
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

          {isEnriching ? (
            <p className="notice notice--attn">
              Saving to an existing issue is not built yet. Clear the key above to write a new one.
            </p>
          ) : (
            <ChangeDiffTable
              changeSet={changeSet}
              outcome={outcome}
              onApply={create}
              onDismiss={() => {
                setChangeSet(null);
                setOutcome(null);
              }}
            />
          )}
        </div>
      )}

    </section>
  );
}
