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

/** How often to ask who is running while the handover is happening. */
const HANDOVER_POLL_MS = 700;

/** How long to wait for the new version before saying so. */
const HANDOVER_TIMEOUT_MS = 45 * 1000;

/** What the server found out about updates. */
interface UpdateState {
  readonly installedVersion: string;
  readonly isCheckPossible: boolean;
  readonly isUpdateAvailable: boolean;
  readonly latestVersion: string | null;
  readonly reason: string | null;
}

/**
 * Waits for the new version to be the one answering, then reloads.
 *
 * Waiting for the PORT to answer would be wrong: the old copy answers right up
 * until it exits, so reloading on that would put a new interface in front of the
 * old server. The version is the only honest signal that the handover is done.
 */
function RestartWatch({ version }: { readonly version: string }): JSX.Element {
  const [hasTakenTooLong, setHasTakenTooLong] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt > HANDOVER_TIMEOUT_MS) {
        setHasTakenTooLong(true);
        window.clearInterval(timer);
        return;
      }
      try {
        const response = await fetch("/api/instance");
        const body = await response.json();
        if (body.version === version) window.location.reload();
      } catch {
        // The old copy has gone and the new one is not up yet. Expected, and
        // the only moment in the handover when nothing answers.
      }
    }, HANDOVER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [version]);

  if (hasTakenTooLong) {
    return (
      <span className="version-chip version-chip--ready" title="Start Jira+ from the launcher">
        {version} installed — start Jira+ again
      </span>
    );
  }

  return (
    <span className="version-chip version-chip--available" title={`Starting ${version}`}>
      Restarting into {version}…
    </span>
  );
}

/** The version indicator. */
export function VersionChip(): JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [restartingInto, setRestartingInto] = useState<string | null>(null);
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
      if (!response.ok) {
        setProblem(body.reason);
        return;
      }
      // The server hands over to the new version itself. Until it comes back,
      // this page is talking to a copy that is on its way out.
      if (body.isRestarting === true) setRestartingInto(body.installedVersion);
      else setInstalledVersion(body.installedVersion);
    } catch {
      setProblem("The update could not be downloaded.");
    } finally {
      setIsInstalling(false);
    }
  }

  if (restartingInto !== null) {
    return <RestartWatch version={restartingInto} />;
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
