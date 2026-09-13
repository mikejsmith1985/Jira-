// QueryConsoleView.tsx — Paste a query, see everything it matched.
//
// The first surface anyone meets, and useful before anything is configured. It
// exists to make one promise visible: what you see came from this exact query,
// at this exact time, and here it is to run yourself.
//
// A failed retrieval shows no table, no count and no score — only what Jira
// said. That absence is the feature.

import type { JSX } from "react";

import { useCallback, useEffect, useState } from "react";

import { ASK_ANYTHING_PACK, buildEmptyCriteria, createDataCenterAdapter } from "@jira-plus/core";
import type { DetailedIssue, WorkspaceConfiguration } from "@jira-plus/core";

import { PackPanel } from "../components/PackPanel.js";
import { SimpleSearchPanel } from "../components/SimpleSearchPanel.js";
import type { SearchChoices } from "../components/SimpleSearchPanel.js";
import { createBrowserJiraTransport } from "../state/jiraTransport.js";
import { ProvenanceBanner } from "../components/ProvenanceBanner.js";
import type { IssueSetState } from "../state/useIssueSet.js";

/**
 * Reads a concept for the prompt.
 *
 * The free-form pack requires no mapped concept, so this returns nothing today.
 * It exists as the seam every other pack reads through, so no pack can ever
 * reach a raw Jira field id directly.
 */
function readNoConcept(): unknown {
  return null;
}

/** Copies text, tolerating a browser that refuses clipboard access. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Nothing to recover: the query is on screen and selectable.
  }
}

/** One issue row. */
function IssueRow({ issue }: { readonly issue: DetailedIssue }): JSX.Element {
  const summary = String(issue.fields.get("summary") ?? "");
  return (
    <tr>
      <td className="mono">{issue.key}</td>
      <td className="issue-row__summary">{summary}</td>
      <td>{issue.issueTypeName}</td>
      <td>
        <span className="chip">{issue.statusName}</span>
      </td>
    </tr>
  );
}

/** What the console needs. */
export interface QueryConsoleViewProps {
  readonly issueSetState: IssueSetState;
  readonly configuration: WorkspaceConfiguration | null;
}

/** The query console. */
export function QueryConsoleView({
  issueSetState,
  configuration,
}: QueryConsoleViewProps): JSX.Element {
  // Basic first. The people this product failed to reach are the ones who
  // cannot write JQL, and a screen that opens on a JQL box tells them so before
  // they have typed anything.
  const [mode, setMode] = useState<"basic" | "jql">("basic");
  const [criteria, setCriteria] = useState(buildEmptyCriteria());
  const [choices, setChoices] = useState<SearchChoices | null>(null);
  const [draftJql, setDraftJql] = useState("");
  const [doesRequestAllFields, setDoesRequestAllFields] = useState(false);
  // On by default HERE and nowhere else. "Is this in the right status" cannot be
  // answered from the status - only from how long it has been there and what it
  // moved back from. Every question asked on this screen is that shape.
  const [doesRequestHistory, setDoesRequestHistory] = useState(true);
  const { issueSet, isRetrieving, progress, run } = issueSetState;

  /** Runs whatever query was built or typed, through the one retrieval path. */
  const runQuery = useCallback(
    (jql: string) => {
      if (jql.trim().length === 0) return;
      void run(jql.trim(), { doesRequestAllFields, doesRequireChangelog: doesRequestHistory });
    },
    [run, doesRequestAllFields, doesRequestHistory],
  );

  // Jira's own lists, so nobody has to type a project key exactly right. A
  // failure leaves them null, which the panel says out loud rather than
  // rendering as "this instance has no projects".
  useEffect(() => {
    const adapter = createDataCenterAdapter(createBrowserJiraTransport());
    void (async () => {
      const [projects, issueTypes, statuses] = await Promise.all([
        adapter.fetchProjects(),
        adapter.fetchAllIssueTypes(),
        adapter.fetchStatuses(),
      ]);
      if (projects.body === null) return;
      setChoices({
        projects: projects.body,
        issueTypes: issueTypes.body ?? [],
        statuses: statuses.body ?? [],
      });
    })();
  }, []);

  return (
    <section className="console">
      <h2 className="view__title">Ask anything about any set of issues</h2>
      <p className="view__lede">
        Pick what you are looking for, or write the query yourself. Either way it is retrieved once,
        and every other screen reads from that one result.
      </p>

      <div className="segmented" role="group" aria-label="How to search">
        <button
          type="button"
          className="segmented__button"
          aria-pressed={mode === "basic"}
          onClick={() => setMode("basic")}
        >
          Basic search
        </button>
        <button
          type="button"
          className="segmented__button"
          aria-pressed={mode === "jql"}
          onClick={() => setMode("jql")}
        >
          JQL
        </button>
      </div>

      {mode === "basic" ? (
        <SimpleSearchPanel
          criteria={criteria}
          choices={choices}
          isRetrieving={isRetrieving}
          onChange={setCriteria}
          onSearch={runQuery}
          onEditAsJql={(jql) => {
            // The path from picking to writing: take the query it built and
            // carry on from there, the way Jira lets you.
            setDraftJql(jql);
            setMode("jql");
          }}
        />
      ) : null}

      <form
        className="console__form"
        hidden={mode !== "jql"}
        onSubmit={(event) => {
          event.preventDefault();
          runQuery(draftJql);
        }}
      >
        <label className="console__label" htmlFor="jql">
          JQL
        </label>
        <textarea
          id="jql"
          className="console__jql mono"
          rows={3}
          value={draftJql}
          spellCheck={false}
          placeholder="project = ENCUC AND sprint in openSprints() ORDER BY created DESC"
          onChange={(event) => setDraftJql(event.target.value)}
        />

        <div className="console__actions">
          <label className="console__toggle">
            <input
              type="checkbox"
              checked={doesRequestAllFields}
              onChange={(event) => setDoesRequestAllFields(event.target.checked)}
            />{" "}
            Fetch every field (slower, and much larger)
          </label>
          <label className="console__toggle">
            <input
              type="checkbox"
              checked={doesRequestHistory}
              onChange={(event) => setDoesRequestHistory(event.target.checked)}
            />{" "}
            Include status history (how each issue reached where it is)
          </label>

          <button type="submit" className="button" disabled={isRetrieving || draftJql.trim().length === 0}>
            {isRetrieving ? "Retrieving…" : "Run"}
          </button>
        </div>
      </form>

      {isRetrieving && progress !== null ? (
        <p className="console__progress tabular">
          {progress.fetchedCount.toLocaleString()} of {progress.totalMatchingCount.toLocaleString()}{" "}
          retrieved so far…
        </p>
      ) : null}

      {issueSet === null ? null : (
        <>
          <ProvenanceBanner record={issueSet.record} onCopyQuery={copyToClipboard} />

          {/* No table, no count, no score when the query failed. There is
              nothing legitimate to show, so nothing is shown. */}
          {issueSet.record.failure !== null ? null : (
            <div className="console__results">
              {issueSet.issues.length === 0 ? (
                <p className="console__empty">
                  This query ran successfully and matched nothing. That is an answer, not a
                  failure — the query above is exactly what was asked.
                </p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Key</th>
                      <th scope="col">Summary</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issueSet.issues.map((issue) => (
                      <IssueRow key={issue.key} issue={issue} />
                    ))}
                  </tbody>
                </table>
              )}

              {configuration === null || issueSet.issues.length === 0 ? null : (
                <PackPanel
                  pack={ASK_ANYTHING_PACK}
                  issueSet={issueSet}
                  configuration={configuration}
                  readConcept={readNoConcept}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
