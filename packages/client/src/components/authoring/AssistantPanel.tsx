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

import {
  buildAuthoringPromptHead,
  buildBatchPromptHead,
  chunkAuthoringPrompt,
  parseAuthoringReply,
  parseBatchReply,
} from "@jira-plus/core";
import type {
  AuthoringDraft,
  BatchProposal,
  BatchShape,
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
  /** Set when the operator is writing several issues rather than one. */
  readonly batchShape?: BatchShape | null;
  /** Jira's own names for the two types, so the prompt asks for what will
   *  actually be created rather than for a Story the instance may not have. */
  readonly parentTypeName?: string;
  readonly childTypeName?: string;
  readonly onAcceptBatch?: (proposal: BatchProposal) => void;
}

/** The round-trip surface. */
export function AssistantPanel({
  draft,
  shape,
  sections,
  budgetCharacters,
  onAccept,
  batchShape = null,
  parentTypeName = "Feature",
  childTypeName = "Story",
  onAcceptBatch,
}: AssistantPanelProps): JSX.Element {
  const [parts, setParts] = useState<readonly AuthoringPromptPart[]>([]);
  const [copiedParts, setCopiedParts] = useState<ReadonlySet<number>>(new Set());
  const [replyText, setReplyText] = useState("");
  const [proposal, setProposal] = useState<AuthoringProposal | null>(null);
  const [batchProposal, setBatchProposal] = useState<BatchProposal | null>(null);

  /** Builds the prompt from the draft, the sources and the create screen. */
  function buildPrompt(): void {
    setProposal(null);
    setCopiedParts(new Set());
    setBatchProposal(null);
    const resolvedShape = shape ?? {
      status: "unavailable" as const,
      reason: "No issue type has been chosen yet.",
    };
    const head =
      batchShape === null
        ? buildAuthoringPromptHead({ draft, shape: resolvedShape, sections })
        : buildBatchPromptHead({
            draft,
            shape: resolvedShape,
            sections,
            isHierarchy: batchShape === "feature-with-stories",
            parentTypeName,
            childTypeName,
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

  /**
   * Reads a pasted reply and puts it in the draft.
   *
   * One step, not two. The earlier version parsed, said "read it", and waited
   * for a second click to apply — but the draft is not Jira, and every proposal
   * in it is still editable and still gated by the diff before anything is
   * written. The second click confirmed nothing and cost a step on every single
   * round trip.
   *
   * A reply that was refused whole applies nothing, which is the case the
   * confirmation was really there for.
   */
  function readReply(): void {
    const resolvedShape = shape ?? {
      status: "unavailable" as const,
      reason: "No issue type has been chosen yet.",
    };

    if (batchShape !== null && onAcceptBatch !== undefined) {
      const parsed = parseBatchReply({ replyText, shape: resolvedShape, sections });
      setBatchProposal(parsed);
      if (parsed.refusedReason === null) onAcceptBatch(parsed);
      return;
    }

    const parsed = parseAuthoringReply({ replyText, shape: resolvedShape, sections });
    setProposal(parsed);
    if (parsed.refusedReason === null) onAccept(parsed);
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
            className="button button--primary"
            disabled={replyText.trim().length === 0}
            onClick={readReply}
          >
            Put it in my draft
          </button>
        </div>
      </div>

      {batchProposal === null ? null : batchProposal.refusedReason !== null ? (
        <p className="notice notice--error">{batchProposal.refusedReason}</p>
      ) : (
        <div className="authoring__proposal">
          <p className="notice notice--pass">
            <strong>
              {batchProposal.issues.length} issue
              {batchProposal.issues.length === 1 ? "" : "s"} in your list.
            </strong>{" "}
            Read them, change anything you disagree with, then create them. Nothing reaches Jira
            until you do.
          </p>
          {batchProposal.discardedCount === 0 ? null : (
            <p className="notice notice--attn">
              The reply proposed {batchProposal.discardedCount} more than were kept. A list nobody
              reads is a list nobody checked, so the extras were dropped rather than accepted.
            </p>
          )}
        </div>
      )}

      {proposal === null ? null : proposal.refusedReason !== null ? (
        <p className="notice notice--error">{proposal.refusedReason}</p>
      ) : (
        <div className="authoring__proposal">
          <p className="notice notice--pass">
            <strong>In your draft.</strong> Change anything you disagree with — nothing reaches Jira
            until you press create or save, and you will see every field first.
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

        </div>
      )}
    </section>
  );
}
