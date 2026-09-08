// RelayPanel.test.tsx — The screen that replaces "paste your token here".
//
// Two behaviours here are worth pinning down, and both are about not lying.
//
// A relay dies the moment its tab is closed, and nothing tells the server that
// happened until a heartbeat goes stale. So the panel asks again on a timer
// rather than reading once — a stale "connected" is exactly the confident wrong
// answer this product exists to remove.
//
// And a tab that is still polling proves the browser is alive; it proves nothing
// about whether Jira will still talk to us. A dropped VPN leaves the tab happily
// polling while every call comes back 401, so a refused relay says so instead of
// staying green.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RelayPanel } from "../src/components/RelayPanel.js";

afterEach(cleanup);
beforeEach(() => vi.unstubAllGlobals());

/** Answers both routes the panel calls. */
function stubRelay(status: Record<string, unknown>, code = "javascript:(function(){})()") {
  const fetchSpy = vi.fn(async (url: string) =>
    url.includes("bookmarklet")
      ? ({ ok: true, json: async () => ({ code }) } as Response)
      : ({ ok: true, json: async () => status } as Response),
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

/** A relay that is up and working. */
const CONNECTED = {
  isConnected: true,
  isAuthorized: true,
  origin: "https://jira.example.org",
  displayName: "Smith, Michael (CTR)",
};

/** A relay that has never been started. */
const DISCONNECTED = {
  isConnected: false,
  isAuthorized: true,
  origin: null,
  displayName: null,
};

describe("when nothing is relaying", () => {
  it("gives the three steps rather than an error", async () => {
    // Not being set up yet is the normal first state, not a fault.
    stubRelay(DISCONNECTED);
    render(<RelayPanel />);

    expect(await screen.findByText(/no jira tab is relaying/i)).toBeTruthy();
    expect(screen.getByText(/drag this link to your bookmarks bar/i)).toBeTruthy();
  });

  it("offers the bookmarklet as a javascript: link, which is what makes it draggable", async () => {
    stubRelay(DISCONNECTED, "javascript:(function(){var relay='http://127.0.0.1:5556';})()");
    render(<RelayPanel />);

    const link = (await screen.findByRole("link", { name: /jira\+ relay/i })) as HTMLAnchorElement;

    expect(link.getAttribute("href")).toContain("javascript:");
    expect(link.getAttribute("href")).toContain("127.0.0.1:5556");
  });
});

describe("when a tab is relaying", () => {
  it("names who Jira says you are, so it is evidence and not a claim", async () => {
    stubRelay(CONNECTED);
    render(<RelayPanel />);

    expect(await screen.findByText(/smith, michael \(ctr\)/i)).toBeTruthy();
  });

  it("says plainly that no token is needed", async () => {
    stubRelay(CONNECTED);
    render(<RelayPanel />);

    expect(await screen.findByText(/no token is needed/i)).toBeTruthy();
  });

  it("warns when Jira refused, rather than staying green because the tab is open", async () => {
    // The failure mode this exists for: VPN drops, tab keeps polling, every
    // call 401s, and the panel would otherwise still read connected.
    stubRelay({ ...CONNECTED, isAuthorized: false });
    render(<RelayPanel />);

    expect(await screen.findByText(/jira refused the last request/i)).toBeTruthy();
  });
});

describe("keeping the answer current", () => {
  it("re-asks on a timer, because a closed tab announces nothing", async () => {
    // A relay dies the moment its tab closes and nothing reports that. Reading
    // the status once would leave a stale "connected" on screen indefinitely,
    // which is the confident wrong answer this product exists to remove.
    const setInterval = vi.spyOn(window, "setInterval");
    stubRelay(CONNECTED);

    render(<RelayPanel />);
    await screen.findByText(/smith, michael/i);

    expect(setInterval).toHaveBeenCalled();
    setInterval.mockRestore();
  });

  it("stops asking once it is gone, rather than polling a dead page", async () => {
    const clearInterval = vi.spyOn(window, "clearInterval");
    stubRelay(CONNECTED);

    const { unmount } = render(<RelayPanel />);
    await screen.findByText(/smith, michael/i);
    unmount();

    expect(clearInterval).toHaveBeenCalled();
    clearInterval.mockRestore();
  });
});
