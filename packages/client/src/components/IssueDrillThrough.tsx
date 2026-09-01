// IssueDrillThrough.tsx — The list behind a number.
//
// This list IS the number it was opened from — the same array, not a second
// query — so the two cannot disagree. That is the sentence on screen, and it is
// literally true rather than a claim about diligence.
//
// Where a Jira query can express the same question, a link to it is offered as
// well. The link is built from the JQL alias rather than the REST field name,
// because the predecessor got that wrong and produced a correct count sitting
// beside a link that returned an error — which reads to a user as the number
// being wrong.

import type { JSX } from "react";

import { buildJiraBrowseUrl, buildJiraSearchUrl } from "@jira-plus/core";

/** What the drill-through needs. */
export interface IssueDrillThroughProps {
  readonly title: string;
  readonly issueKeys: readonly string[];
  readonly jql: string | null;
  readonly jiraBaseUrl: string;
  readonly onClose: () => void;
}

/** The list behind a number. */
export function IssueDrillThrough({
  title,
  issueKeys,
  jql,
  jiraBaseUrl,
  onClose,
}: IssueDrillThroughProps): JSX.Element {
  const canLinkToJira = jiraBaseUrl.length > 0;

  return (
    <section className="drill">
      <div className="drill__head">
        <h3 className="chart__title">{title}</h3>
        <button type="button" className="tile__population" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="chart__note tabular">
        {issueKeys.length} issue{issueKeys.length === 1 ? "" : "s"} — this list IS the number
        above, so they cannot disagree.
      </p>

      {jql === null || !canLinkToJira ? null : (
        <p>
          <a
            className="drill__link"
            href={buildJiraSearchUrl(jiraBaseUrl, jql)}
            target="_blank"
            rel="noreferrer"
          >
            Open these in Jira ↗
          </a>
        </p>
      )}

      <ul className="drill__keys">
        {issueKeys.map((issueKey) => (
          <li key={issueKey} className="mono">
            {canLinkToJira ? (
              <a href={buildJiraBrowseUrl(jiraBaseUrl, issueKey)} target="_blank" rel="noreferrer">
                {issueKey}
              </a>
            ) : (
              issueKey
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
