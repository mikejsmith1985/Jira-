// ConnectionPanel.tsx — Which Jira, and the proof that it answers.
//
// The first release could read a stored address and token and had no way to set
// one. Everything else on this screen is about not guessing which field is
// which; this panel is about the step before that, which was missing entirely.
//
// The token field is write-only by design. It is never sent to the browser, so
// it renders empty even when one is stored, and an empty box on save means
// "leave it alone" rather than "delete it" — otherwise correcting a typo in the
// address would silently wipe the credential.
//
// The Test button matters more than it looks. Saving an address proves nothing;
// a person who has typed a token into four different tools this month wants to
// see their own name come back before they believe any of it.

import type { JSX } from "react";

import { useCallback, useEffect, useState } from "react";

/** What the server is willing to say about the connection. */
interface ConnectionState {
  readonly baseUrl: string;
  readonly isTokenPresent: boolean;
  readonly isSslVerified: boolean;
  readonly isJiraConfigured: boolean;
  readonly port: number;
}

/** What a connection test came back with. */
interface TestOutcome {
  readonly isReachable: boolean;
  readonly isAuthenticated: boolean;
  readonly detail: string;
}

/** Reads the current connection, or null when the server could not be asked. */
async function fetchConnection(): Promise<ConnectionState | null> {
  const response = await fetch("/api/connection");
  return response.ok ? ((await response.json()) as ConnectionState) : null;
}

/** The connection surface. */
export function ConnectionPanel(): JSX.Element {
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [isSslVerified, setIsSslVerified] = useState(true);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [wasSaved, setWasSaved] = useState(false);

  const refresh = useCallback(async () => {
    const current = await fetchConnection();
    if (current === null) return;
    setConnection(current);
    setBaseUrl(current.baseUrl);
    setIsSslVerified(current.isSslVerified);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Tries the values on screen, without committing them. */
  async function test(): Promise<void> {
    setIsBusy(true);
    setProblem(null);
    setOutcome(null);
    try {
      const response = await fetch("/api/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, personalAccessToken: token }),
      });
      const body = await response.json();
      if (response.ok) setOutcome(body as TestOutcome);
      else setProblem(body.reason);
    } finally {
      setIsBusy(false);
    }
  }

  /** Commits the values on screen. */
  async function save(): Promise<void> {
    setIsBusy(true);
    setProblem(null);
    setWasSaved(false);
    try {
      const response = await fetch("/api/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, personalAccessToken: token, isSslVerified }),
      });
      const body = await response.json();
      if (!response.ok) {
        setProblem(body.reason);
        return;
      }
      setConnection(body as ConnectionState);
      // Cleared so the stored token never sits in the DOM after the save that
      // put it there.
      setToken("");
      setWasSaved(true);
    } finally {
      setIsBusy(false);
    }
  }

  const isConfigured = connection?.isJiraConfigured === true;

  return (
    <section className="setup__connection">
      <h2 className="view__title">Which Jira</h2>
      <p className="view__lede">
        One address and one token. Jira+ asks for no other credential, and talks to nothing else.
      </p>

      <p className={`notice notice--${isConfigured ? "pass" : "attn"}`}>
        {isConfigured
          ? `Configured for ${connection?.baseUrl}.`
          : "Not configured yet — nothing on any other screen can load until this is set."}
      </p>

      <div className="console__form">
        <label className="console__label" htmlFor="jira-base-url">
          Your Jira address
        </label>
        <input
          id="jira-base-url"
          className="console__jql mono"
          value={baseUrl}
          placeholder="https://jira.yourcompany.com"
          onChange={(event) => setBaseUrl(event.target.value)}
        />

        <label className="console__label" htmlFor="jira-token">
          Personal access token
        </label>
        <input
          id="jira-token"
          className="console__jql mono"
          type="password"
          value={token}
          autoComplete="off"
          placeholder={
            connection?.isTokenPresent === true
              ? "A token is stored. Type a new one only to replace it."
              : "Paste the token from your Jira profile"
          }
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="chart__note">
          In Jira: your avatar → Profile → Personal Access Tokens → Create token. The token is kept
          in your own profile folder, is never shown back to this page, and never leaves this
          machine except to reach your Jira.
        </p>

        <label className="console__label" htmlFor="jira-ssl">
          <input
            id="jira-ssl"
            type="checkbox"
            checked={isSslVerified}
            onChange={(event) => setIsSslVerified(event.target.checked)}
          />{" "}
          Check the TLS certificate
        </label>
        <p className="chart__note">
          Leave this on. Turn it off only if your network re-signs traffic and the test below fails
          with a certificate error.
        </p>

        <div className="console__actions">
          <button type="button" className="button" disabled={isBusy} onClick={() => void test()}>
            Test connection
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={isBusy || baseUrl.trim().length === 0}
            onClick={() => void save()}
          >
            Save
          </button>
        </div>

        {problem === null ? null : <p className="notice notice--error">{problem}</p>}
        {outcome === null ? null : (
          <p className={`notice notice--${outcome.isAuthenticated ? "pass" : "error"}`}>
            {outcome.detail}
          </p>
        )}
        {wasSaved ? <p className="notice notice--pass">Saved. Every screen uses it now.</p> : null}
      </div>
    </section>
  );
}
