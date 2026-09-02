// InstancePanel.tsx — Which copy you are looking at, and the way to stop it.
//
// Jira+ starts hidden so no console window flashes up. The cost was that there
// was no way to tell one copy from another and no way out except Task Manager,
// which is not an answer for something meant to be easy to use.
//
// So the running copy names itself — port, process id, when it started — and
// offers a Stop button. The process id is not decoration: it is what makes the
// thing on screen findable if the button ever fails.

import type { JSX } from "react";

import { useEffect, useState } from "react";

/** What the running copy says about itself. */
interface InstanceState {
  readonly version: string;
  readonly processId: number;
  readonly port: number;
  readonly startedAtIso: string;
}

/** Formats a moment for reading rather than for parsing. */
function formatMoment(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  return Number.isNaN(parsed.getTime()) ? isoTimestamp : parsed.toLocaleString();
}

/** The running-copy surface. */
export function InstancePanel(): JSX.Element | null {
  const [instance, setInstance] = useState<InstanceState | null>(null);
  const [isStopped, setIsStopped] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/instance");
        if (response.ok) setInstance((await response.json()) as InstanceState);
      } catch {
        // Nothing to say if the copy serving this page cannot describe itself.
      }
    })();
  }, []);

  /** Asks the running copy to exit. */
  async function stop(): Promise<void> {
    try {
      await fetch("/api/instance/stop", { method: "POST" });
    } catch {
      // The connection dropping IS the process exiting, so this is expected.
    }
    setIsStopped(true);
  }

  if (instance === null) return null;

  if (isStopped) {
    return (
      <p className="notice notice--pass">
        <strong>Jira+ has stopped.</strong> This page will no longer load. Double-click{" "}
        <strong>Launch Jira Plus</strong> to start it again.
      </p>
    );
  }

  return (
    <div className="notice">
      <p>
        You are looking at <strong>version {instance.version}</strong> on{" "}
        <strong>port {instance.port}</strong>, process{" "}
        <span className="mono">{instance.processId}</span>, running since{" "}
        {formatMoment(instance.startedAtIso)}.
      </p>
      <p className="chart__note">
        Only one copy can serve a port, so this is the only one you can reach. Starting Jira+ again
        opens this same copy rather than a second one.
      </p>
      <div className="console__actions">
        <button type="button" className="button" onClick={() => void stop()}>
          Stop Jira+
        </button>
      </div>
    </div>
  );
}
