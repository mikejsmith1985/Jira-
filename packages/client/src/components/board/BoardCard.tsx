// BoardCard.tsx — One issue on the board.
//
// The markers are the point of restraint here. Code review is not a status, so
// it is a badge on the card and never a column. Inventing a column Jira does not
// have is exactly what would stop the board's counts reconciling with Jira's
// own, and reconciling is the whole reason this board reads its columns rather
// than declaring them.

import type { JSX } from "react";

import { buildJiraBrowseUrl } from "@jira-plus/core";
import type { DetailedIssue } from "@jira-plus/core";

/** What one card needs. */
export interface BoardCardProps {
  readonly issue: DetailedIssue;
  readonly markers: readonly string[];
  readonly jiraBaseUrl: string;
}

/** One issue card. */
export function BoardCard({ issue, markers, jiraBaseUrl }: BoardCardProps): JSX.Element {
  const summary = String(issue.fields.get("summary") ?? "");
  const canLink = jiraBaseUrl.length > 0;

  return (
    <article className="card" data-status-category={issue.statusCategoryKey}>
      <p className="card__key mono">
        {canLink ? (
          <a href={buildJiraBrowseUrl(jiraBaseUrl, issue.key)} target="_blank" rel="noreferrer">
            {issue.key}
          </a>
        ) : (
          issue.key
        )}
      </p>

      <p className="card__summary">{summary}</p>

      <p className="card__meta">
        <span className="chip">{issue.issueTypeName}</span>{" "}
        <span className="chip">{issue.statusName}</span>
      </p>

      {markers.length === 0 ? null : (
        <p className="card__markers">
          {markers.map((marker) => (
            <span key={marker} className="card__marker">
              {marker}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}
