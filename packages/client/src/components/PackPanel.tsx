// PackPanel.tsx — The copy-and-paste round trip, tracked honestly.
//
// The panel builds prompts, tracks which parts have come back, parses replies
// and shows what was rejected. It writes NOTHING. Accepted proposals are handed
// up to the owning surface, which builds a change set and shows a diff before
// anything is sent.
//
// Two things here are load-bearing rather than decorative. The part count is
// shown before the user copies anything, because with an 18,000-character box
// and real issue content, several parts is normal. And every count of what was
// dropped, invented or unreadable is rendered — those numbers are part of the
// answer, not diagnostics to hide behind a log.

import type { JSX } from "react";

import { useMemo, useState } from "react";

import { buildPromptChunks, parsePackReply } from "@jira-plus/core";
import type {
  IssueSet,
  PackContext,
  PackReplyResult,
  PromptChunk,
  PromptPack,
  ValidatedItem,
  WorkspaceConfiguration,
} from "@jira-plus/core";

/** Copies text, tolerating a browser that refuses clipboard access. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The prompt is on screen and selectable, so there is nothing to recover.
  }
}

/** What the panel needs. */
export interface PackPanelProps {
  readonly pack: PromptPack;
  readonly issueSet: IssueSet;
  readonly configuration: WorkspaceConfiguration;
  readonly readConcept: PackContext["readConcept"];
  readonly onAccept?: (items: readonly ValidatedItem[]) => void;
}

/** Renders the rejection of a whole reply. */
function RejectionNotice({ result }: { readonly result: PackReplyResult }): JSX.Element | null {
  if (result.rejection === null) return null;
  return (
    <p className="notice notice--error" role="alert">
      {result.rejection.detail}
    </p>
  );
}

/** Renders the honest account of what a reply contained. */
function ReplyLedger({ result }: { readonly result: PackReplyResult }): JSX.Element {
  return (
    <dl className="ledger">
      <div>
        <dt>Answers accepted</dt>
        <dd className="tabular">{result.items.length}</dd>
      </div>
      {result.unknownKeys.length === 0 ? null : (
        <div className="ledger__flag">
          <dt>Issue keys that were not in this part</dt>
          <dd className="tabular">
            {result.unknownKeys.length} — dropped: {result.unknownKeys.join(", ")}
          </dd>
        </div>
      )}
      {result.unparsedCount === 0 ? null : (
        <div className="ledger__flag">
          <dt>Answers that could not be read</dt>
          <dd className="tabular">{result.unparsedCount}</dd>
        </div>
      )}
      {result.duplicateKeys.length === 0 ? null : (
        <div className="ledger__flag">
          <dt>Issues answered more than once</dt>
          <dd className="tabular">{result.duplicateKeys.join(", ")}</dd>
        </div>
      )}
      {result.truncatedFields.length === 0 ? null : (
        <div className="ledger__flag">
          <dt>Answers shortened to fit</dt>
          <dd className="tabular">{result.truncatedFields.length}</dd>
        </div>
      )}
    </dl>
  );
}

/** The assistant round-trip panel. */
export function PackPanel({
  pack,
  issueSet,
  configuration,
  readConcept,
  onAccept,
}: PackPanelProps): JSX.Element {
  const [userQuestion, setUserQuestion] = useState("");
  const [chunkStates, setChunkStates] = useState<Record<number, PromptChunk["state"]>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, PackReplyResult>>({});

  const context: PackContext = useMemo(
    () => ({ issueSet, fieldMap: configuration.fieldMap, readConcept }),
    [issueSet, configuration.fieldMap, readConcept],
  );

  const chunkSet = useMemo(
    () =>
      buildPromptChunks(pack, issueSet, context, {
        budgetCharacters: configuration.transferBudgetCharacters,
        userQuestion,
      }),
    [pack, issueSet, context, configuration.transferBudgetCharacters, userQuestion],
  );

  const returnedCount = Object.values(chunkStates).filter((state) => state === "returned").length;
  const coveredKeyCount = chunkSet.chunks
    .filter((chunk) => chunkStates[chunk.index] === "returned")
    .reduce((total, chunk) => total + chunk.issueKeyWhitelist.length, 0);
  const totalKeyCount = chunkSet.chunks.reduce(
    (total, chunk) => total + chunk.issueKeyWhitelist.length,
    0,
  );

  const acceptedItems = Object.values(results).flatMap((result) => result.items);

  function ingestReply(chunk: PromptChunk): void {
    const draft = replyDrafts[chunk.index] ?? "";
    if (draft.trim().length === 0) return;
    const result = parsePackReply(pack, draft, chunk);
    setResults((previous) => ({ ...previous, [chunk.index]: result }));
    if (result.rejection === null) {
      setChunkStates((previous) => ({ ...previous, [chunk.index]: "returned" }));
    }
  }

  return (
    <section className="pack">
      <h3 className="pack__title">{pack.title}</h3>
      <p className="pack__purpose">{pack.purpose}</p>

      <label className="console__label" htmlFor="pack-question">
        What do you want to know?
      </label>
      <textarea
        id="pack-question"
        className="console__jql"
        rows={2}
        value={userQuestion}
        placeholder="Which of these are blocked on someone outside the team?"
        onChange={(event) => setUserQuestion(event.target.value)}
      />

      <div className="receipt">
        <span className="receipt__lead tabular">
          {chunkSet.chunks.length} part{chunkSet.chunks.length === 1 ? "" : "s"}
        </span>
        <span className="receipt__item tabular">
          budget {configuration.transferBudgetCharacters.toLocaleString()} characters
        </span>
        <span className="receipt__item tabular">
          {returnedCount} of {chunkSet.chunks.length} returned
        </span>
        {returnedCount > 0 && returnedCount < chunkSet.chunks.length ? (
          <p className="receipt__note">
            This answer covers {coveredKeyCount} of {totalKeyCount} issues so far. It is not
            complete until every part has come back.
          </p>
        ) : null}
      </div>

      {chunkSet.untransferableKeys.length === 0 ? null : (
        <p className="notice">
          {chunkSet.untransferableKeys.length} issue
          {chunkSet.untransferableKeys.length === 1 ? "" : "s"} could not be sent because their own
          detail exceeds one part on its own: {chunkSet.untransferableKeys.join(", ")}. They were
          skipped rather than divided, and are not covered by any answer below.
        </p>
      )}

      <ol className="pack__chunks">
        {chunkSet.chunks.map((chunk) => {
          const state = chunkStates[chunk.index] ?? "pending";
          const result = results[chunk.index];
          return (
            <li key={chunk.index} className={`pack__chunk pack__chunk--${state}`}>
              <div className="pack__chunk-head">
                <span className="pack__chunk-label mono">
                  Part {chunk.index} of {chunk.total}
                </span>
                <span className="pack__chunk-count tabular">
                  {chunk.issueKeyWhitelist.length} issues ·{" "}
                  {chunk.characterCount.toLocaleString()} characters
                </span>
                <span className={`chip chip--${state === "returned" ? "pass" : "na"}`}>
                  {state === "returned" ? "answer received" : state === "copied" ? "copied" : "not sent"}
                </span>
              </div>

              <div className="pack__chunk-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    void copyToClipboard(chunk.text);
                    setChunkStates((previous) => ({ ...previous, [chunk.index]: "copied" }));
                  }}
                >
                  Copy part {chunk.index}
                </button>
              </div>

              <textarea
                className="console__jql"
                rows={3}
                value={replyDrafts[chunk.index] ?? ""}
                placeholder="Paste the assistant's reply here"
                onChange={(event) =>
                  setReplyDrafts((previous) => ({ ...previous, [chunk.index]: event.target.value }))
                }
              />

              <button type="button" className="button" onClick={() => ingestReply(chunk)}>
                Read this reply
              </button>

              {result === undefined ? null : (
                <>
                  <RejectionNotice result={result} />
                  {result.rejection === null ? <ReplyLedger result={result} /> : null}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {pack.isReadOnly === true || acceptedItems.length === 0 || onAccept === undefined ? null : (
        <button type="button" className="button" onClick={() => onAccept(acceptedItems)}>
          Review {acceptedItems.length} suggestion{acceptedItems.length === 1 ? "" : "s"}
        </button>
      )}

      {pack.isReadOnly === true && acceptedItems.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              {pack.itemSchema.fields.map((field) => (
                <th key={field.name} scope="col">
                  {field.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {acceptedItems.map((item) => (
              <tr key={item.issueKey}>
                <td className="mono">{item.issueKey}</td>
                {pack.itemSchema.fields.map((field) => (
                  <td key={field.name}>
                    {item.values[field.name] === null ? (
                      <span className="pack__no-answer">no answer</span>
                    ) : (
                      String(item.values[field.name])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
