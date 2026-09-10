// VersionChip.tsx — Always visible, so the update mechanism can be seen working.
//
// The update notice used to say nothing at all when there was nothing to
// install. That is correct behaviour and a bad design: somebody running the
// newest version sees an empty space, which is indistinguishable from a feature
// that does not work — so they keep downloading zips by hand, and have no way to
// find out otherwise until something newer appears.
//
// This is always there. It shows the running version, which is worth knowing on
// its own, and turns into the button when there is something to install. Small
// enough to sit in the header without becoming noise, and present enough that
// the mechanism is visibly alive.

import type { JSX } from "react";

import { useCallback, useEffect, useState } from "react";

/** How often to look for a new release. Rarely: releases are not frequent. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** What the server found out about updates. */
interface UpdateState {
  readonly installedVersion: string;
  readonly isCheckPossible: boolean;
  readonly isUpdateAvailable: boolean;
  readonly latestVersion: string | null;
  readonly reason: string | null;
}

/** The version indicator. */
export function VersionChip(): JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/update/check");
      if (response.ok) setState((await response.json()) as UpdateState);
    } catch {
      // Leaves the last known state rather than flapping between two answers.
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  /** Fetches and installs the newer version beside this one. */
  async function install(): Promise<void> {
    setIsInstalling(true);
    setProblem(null);
    try {
      const response = await fetch("/api/update/install", { method: "POST" });
      const body = await response.json();
      if (response.ok) setInstalledVersion(body.installedVersion);
      else setProblem(body.reason);
    } catch {
      setProblem("The update could not be downloaded.");
    } finally {
      setIsInstalling(false);
    }
  }

  if (state === null) return null;

  if (installedVersion !== null) {
    return (
      <span className="version-chip version-chip--ready" title="Restart to use it">
        {installedVersion} ready — restart Jira+
      </span>
    );
  }

  if (state.isUpdateAvailable) {
    return (
      <button
        type="button"
        className="version-chip version-chip--available"
        disabled={isInstalling}
        title={problem ?? `You are running ${state.installedVersion}`}
        onClick={() => void install()}
      >
        {isInstalling ? "Installing…" : `Update to ${state.latestVersion}`}
      </button>
    );
  }

  // Present even when there is nothing to do, because an empty space is
  // indistinguishable from a broken feature — which is exactly how this was
  // read before.
  return (
    <span
      className="version-chip"
      title={
        state.isCheckPossible
          ? "This is the newest version"
          : (state.reason ?? "Could not check for updates")
      }
    >
      v{state.installedVersion}
      {state.isCheckPossible ? "" : " · offline"}
    </span>
  );
}
