// BatchPanel.tsx — Several issues from one pile of material.
//
// A Product Owner rarely has exactly one issue in front of them. They have a
// brief that is plainly three Features, or one Feature that is five Stories.
// Running the whole round trip once per issue is the friction this removes.
//
// The shape is the OPERATOR's choice, not the assistant's: a pile of material
// that could be read either way would otherwise come back differently every time
// it was asked, and nobody would know which reading they were getting.
//
// The thing this screen has to be honest about is a batch that failed halfway.
// Six issues is six chances to fail on the fifth, and a retry that created the
// Feature again would leave two Features and three orphaned Stories — invisible
// until a colleague found the second one. So every item that was created shows
// its key, and only the ones still missing are offered.

import type { JSX } from "react";

import {
  findBatchBlocker,
  findUncreatedItems,
  isEnrichingExistingIssue,
  isPartlyWritten,
} from "@jira-plus/core";
import type { AuthoringBatch, BatchShape, IssueTypeChoice } from "@jira-plus/core";

/** What the panel needs. */
export interface BatchPanelProps {
  readonly batch: AuthoringBatch;
  readonly isWriting: boolean;
  readonly jiraBaseUrl: string;
  readonly issueTypes: readonly IssueTypeChoice[];
  /** What the draft chose: the type the Feature itself is created as. */
  readonly parentIssueTypeId: string;
  readonly onShapeChange: (shape: BatchShape) => void;
  readonly onRemove: (itemId: string) => void;
  readonly onWrite: () => void;
  readonly onChildIssueTypeChange: (issueTypeId: string) => void;
}

/**
 * Which type the issues beneath the Feature are created as.
 *
 * Asked rather than assumed: every item used to be created with the draft's own
 * type, so a Feature with three Stories quietly became four Features.
 */
function ChildTypePicker({
  issueTypes,
  chosenIssueTypeId,
  onChange,
}: {
  readonly issueTypes: readonly IssueTypeChoice[];
  readonly chosenIssueTypeId: string;
  readonly onChange: (issueTypeId: string) => void;
}): JSX.Element {
  return (
    <div className="console__field">
      <label className="console__label" htmlFor="batch-child-type">
        What type the issues beneath the Feature are
      </label>
      <select
        id="batch-child-type"
        className="console__jql"
        value={chosenIssueTypeId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose one…</option>
        {issueTypes
          .filter((issueType) => !issueType.isSubtask)
          .map((issueType) => (
            <option key={issueType.issueTypeId} value={issueType.issueTypeId}>
              {issueType.name}
            </option>
          ))}
      </select>
    </div>
  );
}

/** The batch surface. */
export function BatchPanel({
  batch,
  isWriting,
  jiraBaseUrl,
  issueTypes,
  parentIssueTypeId,
  onShapeChange,
  onRemove,
  onWrite,
  onChildIssueTypeChange,
}: BatchPanelProps): JSX.Element {
  const remaining = findUncreatedItems(batch);
  const isHalfWritten = isPartlyWritten(batch);
  const blocker = findBatchBlocker(batch, parentIssueTypeId);

  return (
    <section className="authoring__batch">
      <h3 className="authoring__panel-title">Several issues at once</h3>

      <div className="segmented" role="group" aria-label="What shape to write">
        <button
          type="button"
          className="segmented__button"
          aria-pressed={batch.shape === "flat"}
          onClick={() => onShapeChange("flat")}
        >
          Just Features
        </button>
        <button
          type="button"
          className="segmented__button"
          aria-pressed={batch.shape === "feature-with-stories"}
          onClick={() => onShapeChange("feature-with-stories")}
        >
          A Feature with Stories
        </button>
      </div>

      <p className="chart__note">
        {batch.shape === "flat"
          ? "Your material becomes several separate Features, none of them beneath another."
          : "Your material becomes one Feature and the Stories beneath it. The Feature is created first, because a Story cannot be linked to something that does not exist yet."}
      </p>

      {batch.shape === "feature-with-stories" ? (
        <ChildTypePicker
          issueTypes={issueTypes}
          chosenIssueTypeId={batch.childIssueTypeId}
          onChange={onChildIssueTypeChange}
        />
      ) : null}

      {batch.items.length === 0 ? (
        <p className="chart__note">
          Nothing yet. Gather your material, then ask the assistant to break it down.
        </p>
      ) : (
        <ol className="batch__list">
          {batch.items.map((item) => {
            const wasCreated = isEnrichingExistingIssue(item.draft);
            return (
              <li key={item.itemId} className="batch__item">
                <div className="batch__item-head">
                  {item.isParent ? <span className="chip">the Feature</span> : null}
                  <strong>{item.draft.summary || "(no summary yet)"}</strong>
                  {wasCreated ? (
                    <span className="chip chip--pass">
                      {jiraBaseUrl === "" ? (
                        item.draft.existingIssueKey
                      ) : (
                        <a
                          href={`${jiraBaseUrl}/browse/${item.draft.existingIssueKey}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.draft.existingIssueKey}
                        </a>
                      )}
                    </span>
                  ) : (
                    <button type="button" className="button" onClick={() => onRemove(item.itemId)}>
                      Remove
                    </button>
                  )}
                </div>
                {item.draft.description === "" ? null : (
                  <p className="batch__item-text">{item.draft.description}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {isHalfWritten ? (
        <p className="notice notice--attn">
          <strong>Some of these already exist.</strong> The ones with a key were created by an
          earlier attempt and will not be created again — writing now finishes the{" "}
          {remaining.length} that {remaining.length === 1 ? "is" : "are"} still missing.
        </p>
      ) : null}

      {blocker === null ? null : <p className="notice notice--attn">{blocker}</p>}

      {batch.items.length === 0 ? null : (
        <div className="console__actions">
          <button
            type="button"
            className="button button--primary"
            disabled={isWriting || remaining.length === 0 || blocker !== null}
            onClick={onWrite}
          >
            {isWriting
              ? "Writing…"
              : remaining.length === 0
                ? "All of these exist in Jira"
                : `Create ${remaining.length} in Jira`}
          </button>
        </div>
      )}
    </section>
  );
}
