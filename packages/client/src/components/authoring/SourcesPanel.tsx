// SourcesPanel.tsx — What you are writing from.
//
// The material a Product Owner starts with lives in four places: a brief, a
// spreadsheet, two tickets, a conversation. Today it becomes an issue by being
// retyped from memory while none of it is visible. This puts it beside the
// draft, and that is most of the value — it lands before any assistant is
// involved.
//
// Nothing in this panel can change an issue field. A source is reference
// material and has no field id, so a pasted email cannot become an issue nobody
// wrote. That is a property of the shape, not a rule this component enforces.

import type { JSX } from "react";

import { useState } from "react";

import { addSource, removeSource } from "@jira-plus/core";
import type { AuthoringDraft } from "@jira-plus/core";

/** What the panel needs. */
export interface SourcesPanelProps {
  readonly draft: AuthoringDraft;
  readonly onChange: (draft: AuthoringDraft) => void;
}

/** Distinguishes one source from another. */
function buildSourceId(): string {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The gathering surface. */
export function SourcesPanel({ draft, onChange }: SourcesPanelProps): JSX.Element {
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");

  /** Adds what has been typed, and clears the boxes for the next one. */
  function add(sourceLabel: string, sourceText: string): void {
    if (sourceText.trim().length === 0) return;
    onChange(
      addSource(draft, {
        sourceId: buildSourceId(),
        label: sourceLabel.trim().length > 0 ? sourceLabel.trim() : "Untitled",
        text: sourceText,
        addedAtIso: new Date().toISOString(),
      }),
    );
    setLabel("");
    setText("");
  }

  /** Reads a dropped or chosen file as text. */
  async function addFile(file: File): Promise<void> {
    add(file.name, await file.text());
  }

  return (
    <section className="authoring__sources">
      <h3 className="authoring__panel-title">What you are writing from</h3>
      <p className="chart__note">
        Paste anything that helps: a brief, a message, rows from a spreadsheet. It stays here beside
        your draft and is never written to Jira.
      </p>

      <div className="console__form">
        <label className="console__label" htmlFor="source-label">
          What is it?
        </label>
        <input
          id="source-label"
          className="console__jql"
          value={label}
          placeholder="the brief, Jana's message, the numbers"
          onChange={(event) => setLabel(event.target.value)}
        />

        <label className="console__label" htmlFor="source-text">
          Paste it here
        </label>
        <textarea
          id="source-text"
          className="console__jql"
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <div className="console__actions">
          <button
            type="button"
            className="button"
            disabled={text.trim().length === 0}
            onClick={() => add(label, text)}
          >
            Add it
          </button>
          <label className="button" htmlFor="source-file">
            Or add a file
          </label>
          <input
            id="source-file"
            type="file"
            accept=".txt,.md,.csv,.json,text/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void addFile(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      {draft.sources.length === 0 ? (
        <p className="chart__note">
          Nothing gathered yet. You can write without any, but having the material in front of you is
          the point.
        </p>
      ) : (
        <ul className="authoring__source-list">
          {draft.sources.map((source) => (
            <li key={source.sourceId} className="authoring__source">
              <div className="authoring__source-head">
                <strong>{source.label}</strong>
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    onChange(removeSource(draft, source.sourceId, new Date().toISOString()))
                  }
                >
                  Remove
                </button>
              </div>
              <p className="authoring__source-text">{source.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
