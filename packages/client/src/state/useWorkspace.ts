// useWorkspace.ts — Reads the one configuration that can change a number.
//
// It lives on the server, not in this browser, which is the direct fix for the
// predecessor's worst configuration defect: two people opening the same project
// ran different checks and neither was ever told.
//
// A stored document written under different rules is reported rather than
// reinterpreted. Reading old values under new meanings would make a
// configuration say something nobody chose, and then no fingerprint could be
// trusted.

import { useCallback, useEffect, useState } from "react";

import type { WorkspaceConfiguration } from "@jira-plus/core";

/** What the server answers with. */
interface WorkspaceResponse {
  readonly configuration: WorkspaceConfiguration;
  readonly fingerprint: string;
  readonly isFirstRun: boolean;
}

/** What a consumer sees while the configuration is being read, and after. */
export interface WorkspaceState {
  readonly configuration: WorkspaceConfiguration | null;
  readonly fingerprint: string;
  readonly isLoading: boolean;
  readonly isFirstRun: boolean;
  /** Set when the stored document needs a human decision before it can be used. */
  readonly reviewMessage: string | null;
  readonly errorMessage: string | null;
  readonly save: (configuration: WorkspaceConfiguration) => Promise<void>;
  readonly reload: () => Promise<void>;
}

/** Reads and saves the installation's configuration. */
export function useWorkspace(): WorkspaceState {
  const [configuration, setConfiguration] = useState<WorkspaceConfiguration | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setReviewMessage(null);
    try {
      const response = await fetch("/api/workspace");
      const body = await response.json();

      // 409 means the stored document was written under different rules. It is
      // surfaced for a decision, never silently upgraded.
      if (response.status === 409) {
        setReviewMessage(body.review?.reason ?? "This configuration needs review before use.");
        setConfiguration(null);
        return;
      }

      if (!response.ok) {
        setErrorMessage(`The configuration could not be read (status ${response.status}).`);
        return;
      }

      const workspace = body as WorkspaceResponse;
      setConfiguration(workspace.configuration);
      setFingerprint(workspace.fingerprint);
      setIsFirstRun(workspace.isFirstRun);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The configuration could not be read.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(async (next: WorkspaceConfiguration) => {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });

    if (!response.ok) {
      throw new Error(`The configuration was not saved (status ${response.status}).`);
    }

    const body = (await response.json()) as WorkspaceResponse;
    setConfiguration(body.configuration);
    // The fingerprint comes back from the server's own view of the saved
    // document rather than being recomputed here, so the header cannot show a
    // value the stored file does not have.
    setFingerprint(body.fingerprint);
    setIsFirstRun(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    configuration,
    fingerprint,
    isLoading,
    isFirstRun,
    reviewMessage,
    errorMessage,
    save,
    reload,
  };
}
