// RelayPanel.tsx — The way in that asks for nothing.
//
// Every release so far opened by demanding a Jira personal access token, and
// setup has been the worst part of using this. This panel replaces that demand
// with one drag and one click.
//
// The bookmarklet runs inside a Jira tab you are already signed in to, so the
// credential is the session cookie your browser already holds. Jira+ never sees
// it and never stores it — there is nothing to create, paste, rotate or revoke.
//
// It is polled rather than read once. A relay dies when its tab is closed, and a
// panel that showed a stale "connected" would be the very kind of confident
// wrong answer this product exists to remove.

import type { JSX } from "react";

import { useCallback, useEffect, useRef, useState } from "react";

/** How often to re-ask whether a tab is still relaying. */
const STATUS_POLL_MS = 4000;

/** What the bridge says about the relaying tab. */
interface RelayStatus {
  readonly isConnected: boolean;
  readonly isAuthorized: boolean;
  readonly origin: string | null;
  readonly displayName: string | null;
}

/** The relay surface. */
export function RelayPanel(): JSX.Element {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [bookmarkletCode, setBookmarkletCode] = useState<string>("");
  const bookmarkletLinkRef = useRef<HTMLAnchorElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/relay/status");
      if (response.ok) setStatus((await response.json()) as RelayStatus);
    } catch {
      // A failed check leaves the last known state rather than flapping.
    }
  }, []);

  useEffect(() => {
    void refresh();
    // A relay dies silently when its tab closes, so this is asked repeatedly
    // rather than once. A stale "connected" is worse than no answer.
    const timer = window.setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/relay/bookmarklet");
        if (response.ok) setBookmarkletCode(((await response.json()) as { code: string }).code);
      } catch {
        // Without it the panel still explains itself; only the link is missing.
      }
    })();
  }, []);

  // Set on the element rather than through the href prop, because React
  // sanitises `javascript:` URLs away — and a bookmarklet IS a javascript: URL.
  // Through the prop the link renders as dead text, which is exactly how you
  // ship a feature that looks finished and does nothing.
  useEffect(() => {
    if (bookmarkletLinkRef.current !== null && bookmarkletCode !== "") {
      bookmarkletLinkRef.current.setAttribute("href", bookmarkletCode);
    }
  }, [bookmarkletCode]);

  const isConnected = status?.isConnected === true;

  return (
    <section className="setup__relay">
      <h2 className="view__title">Connect without a token</h2>
      <p className="view__lede">
        Jira+ can work through a Jira tab you are already signed in to. Nothing to create, nothing to
        paste, and no credential is ever stored on this machine.
      </p>

      <p className={`notice notice--${isConnected ? "pass" : "attn"}`}>
        {isConnected ? (
          <>
            <strong>Relaying through your browser.</strong> Signed in as{" "}
            {status?.displayName ?? "an unnamed account"} on {status?.origin}. No token is needed.
          </>
        ) : (
          <>
            <strong>No Jira tab is relaying.</strong> Do the three steps below once, and Jira+ works
            with no token at all.
          </>
        )}
      </p>

      {isConnected && status?.isAuthorized === false ? (
        <p className="notice notice--error">
          Jira refused the last request. The tab is still open, but your session or your VPN may have
          dropped. Reload Jira, sign in again, and click the bookmarklet.
        </p>
      ) : null}

      <ol className="setup__steps">
        <li>
          Drag this link to your bookmarks bar:{" "}
          {bookmarkletCode === "" ? (
            <em>preparing…</em>
          ) : (
            <a
              ref={bookmarkletLinkRef}
              className="button"
              draggable
              title="Drag me to your bookmarks bar"
              onClick={(event) => event.preventDefault()}
            >
              Jira+ Relay
            </a>
          )}
        </li>
        <li>Open your Jira in another tab and sign in as you normally would.</li>
        <li>Click the bookmark while you are on that Jira tab.</li>
      </ol>

      <p className="chart__note">
        Clicking it asks Jira who you are and shows the answer, so you can see it worked before you
        rely on it. Leave that tab open while you use Jira+ — closing it stops the relay, and
        clicking the bookmark again restarts it.
      </p>
      <p className="chart__note">
        Every request runs inside that tab using the session your browser already has. Jira+ has no
        token to lose, and revoking access means signing out of Jira like anything else.
      </p>
    </section>
  );
}
