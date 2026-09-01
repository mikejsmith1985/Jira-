// App.tsx — The shell: five surfaces over one engine.
//
// Every surface is a lens over the same retrieved Issue Set. None of them
// fetches independently, which is why they cannot disagree with one another —
// and why the header can state, once, which configuration produced everything
// on screen.

import type { JSX } from "react";

import { useState } from "react";

import { ChangeLogView } from "./views/ChangeLogView.js";
import { FlowView } from "./views/FlowView.js";
import { HygieneView } from "./views/HygieneView.js";
import { QueryConsoleView } from "./views/QueryConsoleView.js";
import { SetupView } from "./views/SetupView.js";
import { useIssueSet } from "./state/useIssueSet.js";
import { useWorkspace } from "./state/useWorkspace.js";

/** The surfaces, in the order someone meets them. */
const SURFACES = [
  { id: "query", label: "Query" },
  { id: "flow", label: "Flow" },
  { id: "hygiene", label: "Hygiene" },
  { id: "changes", label: "Changes" },
  { id: "setup", label: "Setup" },
] as const;

type SurfaceId = (typeof SURFACES)[number]["id"];

/** The application shell. */
export function App(): JSX.Element {
  const [activeSurface, setActiveSurface] = useState<SurfaceId>("query");
  const workspace = useWorkspace();
  const issueSetState = useIssueSet(workspace.configuration);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          Jira<span className="app__plus">+</span>
        </h1>

        <nav className="app__nav" aria-label="Surfaces">
          {SURFACES.map((surface) => (
            <button
              key={surface.id}
              type="button"
              className="app__tab"
              aria-current={activeSurface === surface.id ? "page" : undefined}
              onClick={() => setActiveSurface(surface.id)}
            >
              {surface.label}
            </button>
          ))}
        </nav>

        {/* Shown always, so two people can compare eight characters before they
            compare a number. */}
        <span className="app__fingerprint mono" title="The configuration every number here was computed under">
          config {workspace.fingerprint || "—"}
        </span>
      </header>

      {workspace.reviewMessage === null ? null : (
        <div className="app__notice" role="alert">
          {workspace.reviewMessage}
        </div>
      )}

      {workspace.errorMessage === null ? null : (
        <div className="app__notice app__notice--error" role="alert">
          {workspace.errorMessage}
        </div>
      )}

      <main className="app__main">
        {activeSurface === "query" ? <QueryConsoleView issueSetState={issueSetState} /> : null}
        {activeSurface === "flow" ? (
          <FlowView issueSetState={issueSetState} configuration={workspace.configuration} />
        ) : null}
        {activeSurface === "hygiene" ? (
          <HygieneView issueSetState={issueSetState} configuration={workspace.configuration} />
        ) : null}
        {activeSurface === "changes" ? <ChangeLogView /> : null}
        {activeSurface === "setup" ? <SetupView workspace={workspace} /> : null}
      </main>
    </div>
  );
}
