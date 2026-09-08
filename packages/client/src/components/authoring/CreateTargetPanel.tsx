// CreateTargetPanel.tsx — Which issue this is, and whether it exists yet.
//
// One field decides everything on this screen. Blank means a new issue will be
// created; a key means that issue will be updated. There is no mode toggle and
// no second path, so a duplicate cannot be produced by pressing the wrong thing.
//
// The panel says which it is doing in plain words, at all times, because the
// failure it prevents looks exactly like success until a colleague finds two
// Features describing the same work.

import type { JSX } from "react";

import type { AuthoringDraft, CreateScreenShape, IssueTypeChoice } from "@jira-plus/core";

/** What the panel needs. */
export interface CreateTargetPanelProps {
  readonly draft: AuthoringDraft;
  readonly issueTypes: readonly IssueTypeChoice[];
  readonly shape: CreateScreenShape | null;
  readonly isEnriching: boolean;
  readonly onChange: (change: Partial<AuthoringDraft>) => void;
}

/** The target surface. */
export function CreateTargetPanel({
  draft,
  issueTypes,
  shape,
  isEnriching,
  onChange,
}: CreateTargetPanelProps): JSX.Element {
  return (
    <section className="authoring__target">
      <h3 className="authoring__panel-title">Where it goes</h3>

      <p className={`notice notice--${isEnriching ? "attn" : "pass"}`}>
        {isEnriching ? (
          <>
            <strong>Updating {draft.existingIssueKey}.</strong> Saving changes that issue. It will
            not create a second one.
          </>
        ) : (
          <>
            <strong>Writing a new issue.</strong> Nothing exists in Jira until you choose a project
            and create it.
          </>
        )}
      </p>

      <div className="console__form">
        <label className="console__label" htmlFor="draft-existing-key">
          Enriching an existing issue? Put its key here
        </label>
        <input
          id="draft-existing-key"
          className="console__jql mono"
          value={draft.existingIssueKey ?? ""}
          placeholder="ENCUC-1142 — leave blank to write a new one"
          onChange={(event) =>
            onChange({
              existingIssueKey: event.target.value.trim().length === 0 ? null : event.target.value,
            })
          }
        />
        {isEnriching ? (
          <p className="chart__note">
            Load it to fill this draft from the issue's own values. Saving then writes only the
            fields you actually changed — anything you leave alone is left alone.
          </p>
        ) : null}

        {isEnriching ? null : (
          <>
            <label className="console__label" htmlFor="draft-project">
              Create in project
            </label>
            <input
              id="draft-project"
              className="console__jql mono"
              value={draft.projectKey}
              placeholder="DENP"
              onChange={(event) => onChange({ projectKey: event.target.value.toUpperCase() })}
            />

            <label className="console__label" htmlFor="draft-issue-type">
              Issue type
            </label>
            <select
              id="draft-issue-type"
              className="console__jql"
              value={draft.issueTypeId}
              onChange={(event) => onChange({ issueTypeId: event.target.value })}
            >
              <option value="">Choose one…</option>
              {issueTypes.map((issueType) => (
                <option key={issueType.issueTypeId} value={issueType.issueTypeId}>
                  {issueType.name}
                </option>
              ))}
            </select>
            {issueTypes.length === 0 && draft.projectKey.trim().length > 0 ? (
              <p className="chart__note">
                Waiting for Jira to say which issue types this project offers.
              </p>
            ) : null}
          </>
        )}
      </div>

      {shape === null ? null : shape.status === "unavailable" ? (
        <p className="notice notice--error">
          Jira+ could not read what this issue type requires: {shape.reason} Nothing is written while
          that is unknown.
        </p>
      ) : (
        <div className="authoring__required">
          <p className="chart__note">
            Jira requires these for this issue type. They come from your instance, not from a list in
            this product.
          </p>
          <ul className="authoring__required-list">
            {shape.fields
              .filter((field) => field.isRequired)
              .map((field) => (
                <li key={field.fieldId}>
                  <span className="chip">{field.name}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
