// UpdatePanel.tsx — "There is a newer version" and a button that fetches it.
//
// Downloading a zip from a website by hand is a step nobody performs twice, so
// an update nobody installs is a fix nobody receives. This panel exists so the
// next version arrives without anybody visiting GitHub.
//
// It is quiet when there is nothing to say. A panel that announces "you are up
// to date" every time somebody opens Setup trains people to ignore the place
// where the important message will eventually appear.
//
// The machine this ships to may have no route to GitHub at all. That is a normal
// state, not an error, and it is reported as "could not check" — never as being
// up to date, which would be a claim nothing verified.

import type { JSX } from "react";

import { useCallback, useEffect, useState } from "react";

/** What the server found out about updates. */
interface UpdateState {
  readonly installedVersion: string;
  readonly isCheckPossible: boolean;
  readonly isUpdateAvailable: boolean;
  readonly latestVersion: string | null;
  readonly releaseUrl: string | null;
  readonly reason: string | null;
}

/** The update surface. */
export function UpdatePanel(): JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/update/check");
      if (response.ok) setState((await response.json()) as UpdateState);
    } catch {
      // A failed check is not worth an error of its own; the panel stays quiet.
    }
  }, []);

  useEffect(() => {
    void check();
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
      <p className="notice notice--pass">
        <strong>Version {installedVersion} is installed.</strong> Close Jira+ and start it again
        from the same shortcut to use it. Your settings are untouched.
      </p>
    );
  }

  if (state.isUpdateAvailable) {
    return (
      <div className="notice notice--attn">
        <p>
          <strong>Version {state.latestVersion} is available.</strong> You are running{" "}
          {state.installedVersion}. It installs beside this one, so nothing is overwritten and your
          settings are kept.
        </p>
        <div className="console__actions">
          <button
            type="button"
            className="button button--primary"
            disabled={isInstalling}
            onClick={() => void install()}
          >
            {isInstalling ? "Downloading…" : `Install ${state.latestVersion}`}
          </button>
          {state.releaseUrl === null ? null : (
            <a className="button" href={state.releaseUrl} target="_blank" rel="noreferrer">
              What changed
            </a>
          )}
        </div>
        {problem === null ? null : <p className="notice notice--error">{problem}</p>}
      </div>
    );
  }

  // Silent when up to date. Only the case worth acting on is worth a panel — and
  // "could not check" IS worth acting on, because otherwise somebody assumes
  // they are current when nothing established that.
  if (!state.isCheckPossible) {
    return (
      <p className="chart__note">
        Running {state.installedVersion}. {state.reason} You can still update by downloading the
        latest zip and extracting it over this folder.
      </p>
    );
  }

  return <p className="chart__note">Running {state.installedVersion} — the newest version.</p>;
}
