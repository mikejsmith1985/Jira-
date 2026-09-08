// AssistantPanel.tsx — Out to Copilot, back into the draft, and no further.
//
// There is no assistant API here, so this is a copy-out and paste-back. That is
// a constraint rather than a design choice, and everything below is about making
// the round trip honest about what it did.
//
// Nothing reaches Jira. A reply becomes proposals in the draft, where they can
// be changed or ignored, and Jira is reached only by the create or save the
// operator presses afterwards.
//
// Every refusal is shown. A dropped field, a rejected value, an unreadable
// fragment — each is named, because a silent drop is indistinguishable from the
// assistant not having proposed it, and somebody would spend an afternoon
// wondering why their Initiative Type never got set.

import type { JSX } from "react";

import { useState } from "react";

import { buildAuthoringPromptHead, chunkAuthoringPrompt, parseAuthoringReply } from "@jira-plus/core";
import type {
  AuthoringDraft,
  AuthoringPromptPart,
  AuthoringProposal,
  CreateScreenShape,
  DescriptionSection,
} from "@jira-plus/core";

/** What the panel needs. */
export interface AssistantPanelProps {
  readonly draft: AuthoringDraft;
  readonly shape: CreateScreenShape | null;
  readonly sections: readonly DescriptionSection[];
  readonly budgetCharacters: number;
  readonly onAccept: (proposal: AuthoringProposal) => void;
}

/** The round-trip surface. */
export function AssistantPanel({
  draft,
  shape,
  sections,
  budgetCharacters,
  onAccept,
}: AssistantPanelProps): JSX.Element {
  const [parts, setParts] = useState<readonly AuthoringPromptPart[]>([]);
  const [copiedParts, setCopiedParts] = useState<ReadonlySet<number>>(new Set());
  const [replyText, setReplyText] = useState("");
  const [proposal, setProposal] = useState<AuthoringProposal | null>(null);

  /** Builds the prompt from the draft, the sources and the create screen. */
  function buildPrompt(): void {
    setProposal(null);
    setCopiedParts(new Set());
    const head = buildAuthoringPromptHead({
      draft,
      shape: shape ?? { status: "unavailable", reason: "No issue type has been chosen yet." },
      sections,
    });
    setParts(chunkAuthoringPrompt({ head, sources: draft.sources, budgetCharacters }));
  }

  /** Copies one part, and records that it went. */
  async function copyPart(part: AuthoringPromptPart): Promise<void> {
    try {
      await navigator.clipboard.writeText(part.text);
      setCopiedParts((current) => new Set(current).add(part.partNumber));
    } catch {
      // Clipboard access can be refused outright. The text is on screen and can
      // be selected by hand, which is why it is rendered rather than hidden.
    }
  }

  /** Reads a pasted reply. Writes nothing. */
  function readReply(): void {
    setProposal(
      parseAuthoringReply({
        replyText,
        shape: shape ?? { status: "unavailable", reason: "No issue type has been chosen yet." },
        sections,
      }),
    );
  }

  return (
    <section className="authoring__assistant">
      <h3 className="authoring__panel-title">Ask your assistant</h3>
      <p className="chart__note">
        Jira+ cannot call an assistant, so this is a copy out and a paste back. Nothing you paste
        here reaches Jira — it lands in the draft, where you can change or ignore it.
      </p>

      <div className="console__actions">
        <button type="button" className="button" onClick={buildPrompt}>
          Build the prompt
        </button>
      </div>

      {parts.length === 0 ? null : (
        <div className="authoring__parts">
          {parts.length > 1 ? (
            <p className="notice notice--attn">
              This prompt is <strong>{parts.length} parts</strong>. Send them in order and paste each
              reply back before moving on, so a half-finished job is visible rather than silent.
            </p>
          ) : null}

          {parts.map((part) => (
            <div key={part.partNumber} className="authoring__part">
              <div className="authoring__part-head">
                <strong>
                  Part {part.partNumber} of {part.partCount}
                </strong>
                <span className="chip">{copiedParts.has(part.partNumber) ? "copied" : "not copied"}</span>
                <button type="button" className="button" onClick={() => void copyPart(part)}>
                  Copy it
                </button>
              </div>
              {part.hasTruncatedSource ? (
                <p className="notice notice--attn">
                  One of your sources was too long for a single part and was cut short. The prompt
                  says so, so the assistant is not working from half a document without knowing.
                </p>
              ) : null}
              <pre className="authoring__part-text">{part.text}</pre>
            </div>
          ))}
        </div>
      )}

      <div className="console__form">
        <label className="console__label" htmlFor="assistant-reply">
          Paste the reply here
        </label>
        <textarea
          id="assistant-reply"
          className="console__jql mono"
          rows={6}
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
        />
        <div className="console__actions">
          <button
            type="button"
            className="button"
            disabled={replyText.trim().length === 0}
            onClick={readReply}
          >
            Read the reply
          </button>
        </div>
      </div>

      {proposal === null ? null : proposal.refusedReason !== null ? (
        <p className="notice notice--error">{proposal.refusedReason}</p>
      ) : (
        <div className="authoring__proposal">
          <p className="notice notice--pass">
            Read it. Nothing has changed yet — accept it to put these into your draft.
          </p>

          {proposal.rejectedFieldIds.length === 0 ? null : (
            <p className="notice notice--attn">
              Dropped, because your Jira has no such field:{" "}
              <span className="mono">{proposal.rejectedFieldIds.join(", ")}</span>
            </p>
          )}
          {proposal.rejectedValues.length === 0 ? null : (
            <p className="notice notice--attn">
              Dropped, because the field would not accept the value:{" "}
              <span className="mono">
                {proposal.rejectedValues
                  .map((rejected) => `${rejected.fieldId} = ${rejected.value}`)
                  .join(", ")}
              </span>
            </p>
          )}
          {proposal.unparsedCount === 0 ? null : (
            <p className="notice notice--attn">
              {proposal.unparsedCount} part of the reply could not be read and was ignored.
            </p>
          )}

          <div className="console__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => onAccept(proposal)}
            >
              Put these in my draft
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
