// useAuthoringDraft.ts — The draft, kept where it cannot be lost.
//
// Every edit is saved to the server, debounced, rather than held in the page.
// That is what makes a draft survive a reload, a restart, and being navigated
// away from — which the relay bookmarklet does every time somebody activates it.
//
// The debounce is not a performance concern. It is there so a save is one
// request per pause in typing rather than one per keystroke; losing the last
// half-second of typing to a crash is acceptable, losing the paragraph is not.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildEmptyDraft } from "@jira-plus/core";
import type { AuthoringDraft } from "@jira-plus/core";

/** How long to wait after typing stops before saving. */
const SAVE_DEBOUNCE_MS = 600;

/** What the screen needs to read and change a draft. */
export interface AuthoringDraftState {
  readonly draft: AuthoringDraft;
  readonly isLoading: boolean;
  readonly update: (change: Partial<AuthoringDraft>) => void;
  readonly replace: (draft: AuthoringDraft) => void;
  readonly discard: () => Promise<void>;
}

/** The draft for this installation. */
export function useAuthoringDraft(): AuthoringDraftState {
  const [draft, setDraft] = useState<AuthoringDraft>(() => buildEmptyDraft(new Date().toISOString()));
  const [isLoading, setIsLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/authoring/draft");
        if (response.ok) {
          const stored = ((await response.json()) as { draft: AuthoringDraft | null }).draft;
          if (stored !== null) setDraft(stored);
        }
      } catch {
        // An unreachable server leaves an empty draft, which is the same state
        // as never having written one — and better than a blank screen.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  /** Saves after typing pauses, so it is one request per thought. */
  const scheduleSave = useCallback((next: AuthoringDraft) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void fetch("/api/authoring/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: next }),
      }).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const replace = useCallback(
    (next: AuthoringDraft) => {
      setDraft(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const update = useCallback(
    (change: Partial<AuthoringDraft>) => {
      setDraft((current) => {
        const next = { ...current, ...change, updatedAtIso: new Date().toISOString() };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const discard = useCallback(async () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setDraft(buildEmptyDraft(new Date().toISOString()));
    try {
      await fetch("/api/authoring/draft", { method: "DELETE" });
    } catch {
      // The screen is already clear; a failed delete leaves a stale file that
      // the next save replaces.
    }
  }, []);

  return { draft, isLoading, update, replace, discard };
}
