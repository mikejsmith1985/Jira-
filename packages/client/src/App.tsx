// App.tsx — The shell: five surfaces over one engine.
//
// Every surface is a lens over the same retrieved Issue Set. None of them
// fetches independently, which is why they cannot disagree with one another —
// and why the header can state, once, which configuration produced everything
// on screen.

import type { JSX } from "react";

import { useEffect, useState } from "react";

import { BoardView } from "./views/BoardView.js";
import { ChangeLogView } from "./views/ChangeLogView.js";
import { FlowView } from "./views/FlowView.js";
import { HygieneView } from "./views/HygieneView.js";
import { QueryConsoleView } from "./views/QueryConsoleView.js";
import { SetupView } from "./views/SetupView.js";
import {
  BoardIcon,
  ChangesIcon,
  FlowIcon,
  HygieneIcon,
  MoonIcon,
  QueryIcon,
  SetupIcon,
  SunIcon,
} from "./components/SurfaceIcons.js";
import { useBoard } from "./state/useBoard.js";
import { useIssueSet } from "./state/useIssueSet.js";
import { useTheme } from "./state/useTheme.js";
import { useWorkspace } from "./state/useWorkspace.js";

/** The surfaces, in the order someone meets them. */
const SURFACES = [
  { id: "query", label: "Query", Icon: QueryIcon },
  { id: "board", label: "Board", Icon: BoardIcon },
  { id: "flow", label: "Flow", Icon: FlowIcon },
  { id: "hygiene", label: "Hygiene", Icon: HygieneIcon },
  { id: "changes", label: "Changes", Icon: ChangesIcon },
  { id: "setup", label: "Setup", Icon: SetupIcon },
] as const;

type SurfaceId = (typeof SURFACES)[number]["id"];

/** The application shell. */
export function App(): JSX.Element {
  const [activeSurface, setActiveSurface] = useState<SurfaceId>("query");
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const { theme, setTheme } = useTheme();
  const workspace = useWorkspace();
  const issueSetState = useIssueSet(workspace.configuration);
  const boardState = useBoard(workspace.configuration);

  // Read once, so links into Jira point at the right instance. The health route
  // reports whether a credential exists; it never returns the credential.
  useEffect(() => {
    let isStillMounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/health");
        const body = await response.json();
        if (!isStillMounted) return;
        setJiraBaseUrl(String(body.jiraBaseUrl ?? ""));
        // Nothing on any other surface can load without a credential, so an
        // unconfigured installation opens where it can actually be fixed.
        if (body.isJiraConfigured !== true) setActiveSurface("setup");
      } catch {
        // A missing base URL only costs the links; every number still works.
      }
    })();
    return () => {
      isStillMounted = false;
    };
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          Jira<span className="app__plus">+</span>
        </h1>

        <nav className="app__nav" aria-label="Surfaces" role="tablist">
          {SURFACES.map((surface) => (
            <button
              key={surface.id}
              type="button"
              role="tab"
              className="app__tab"
              aria-selected={activeSurface === surface.id}
              aria-current={activeSurface === surface.id ? "page" : undefined}
              onClick={() => setActiveSurface(surface.id)}
            >
              <surface.Icon />
              {surface.label}
            </button>
          ))}
        </nav>

        <div className="app__meta">
          {/* Shown always, so two people can compare eight characters before
              they compare a number. */}
          <span
            className="app__fingerprint mono"
            title="The configuration every number here was computed under"
          >
            config {workspace.fingerprint || "—"}
          </span>

          <div className="segmented" role="group" aria-label="Theme">
            <button
              type="button"
              className="segmented__button"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
              title="Dark"
            >
              <MoonIcon />
            </button>
            <button
              type="button"
              className="segmented__button"
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
              title="Light"
            >
              <SunIcon />
            </button>
          </div>
        </div>
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
        {activeSurface === "query" ? (
          <QueryConsoleView issueSetState={issueSetState} configuration={workspace.configuration} />
        ) : null}
        {activeSurface === "board" ? (
          <BoardView
            boardState={boardState}
            configuration={workspace.configuration}
            refinements={workspace.configuration?.boardRefinements ?? []}
            cardMarkers={workspace.configuration?.cardMarkers ?? []}
            jiraBaseUrl={jiraBaseUrl}
          />
        ) : null}
        {activeSurface === "flow" ? (
          <FlowView issueSetState={issueSetState} configuration={workspace.configuration} />
        ) : null}
        {activeSurface === "hygiene" ? (
          <HygieneView
            issueSetState={issueSetState}
            configuration={workspace.configuration}
            jiraBaseUrl={jiraBaseUrl}
          />
        ) : null}
        {activeSurface === "changes" ? <ChangeLogView /> : null}
        {activeSurface === "setup" ? <SetupView workspace={workspace} /> : null}
      </main>
    </div>
  );
}
