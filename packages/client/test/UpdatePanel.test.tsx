// UpdatePanel.test.tsx — Quiet when there is nothing to say, honest when it cannot tell.
//
// Two behaviours here are easy to get wrong in opposite directions. A panel that
// announces "you are up to date" loudly on every visit trains people to ignore
// the exact spot where the important message will one day appear. And a panel
// that says "up to date" when it could not reach GitHub at all is stating
// something nothing established — on the locked-down machine this ships to,
// no route to GitHub is a normal condition, not an error.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpdatePanel } from "../src/components/UpdatePanel.js";

afterEach(cleanup);
beforeEach(() => vi.unstubAllGlobals());

/** Answers the check route with a given state. */
function stubCheck(state: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => state }) as Response),
  );
}

describe("when a newer version exists", () => {
  it("names both versions, so the offer can be judged rather than trusted", async () => {
    stubCheck({
      installedVersion: "0.1.1",
      isCheckPossible: true,
      isUpdateAvailable: true,
      latestVersion: "0.1.2",
      releaseUrl: "https://example.invalid/r",
      reason: null,
    });

    render(<UpdatePanel />);

    expect(await screen.findByText(/0\.1\.2 is available/i)).toBeTruthy();
    expect(screen.getByText(/you are running\s*0\.1\.1/i)).toBeTruthy();
  });

  it("says the new version installs beside this one, not over it", async () => {
    stubCheck({
      installedVersion: "0.1.1",
      isCheckPossible: true,
      isUpdateAvailable: true,
      latestVersion: "0.1.2",
      releaseUrl: null,
      reason: null,
    });

    render(<UpdatePanel />);

    expect(await screen.findByText(/beside this one/i)).toBeTruthy();
  });

  it("asks for a restart once installed, because a running program is not replaced", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? ({ ok: true, json: async () => ({ isInstalled: true, installedVersion: "0.1.2" }) } as Response)
          : ({
              ok: true,
              json: async () => ({
                installedVersion: "0.1.1",
                isCheckPossible: true,
                isUpdateAvailable: true,
                latestVersion: "0.1.2",
                releaseUrl: null,
                reason: null,
              }),
            } as Response),
      ),
    );

    render(<UpdatePanel />);
    await userEvent.click(await screen.findByRole("button", { name: /install 0\.1\.2/i }));

    await waitFor(() => expect(screen.getByText(/close jira\+ and start it again/i)).toBeTruthy());
  });
});

describe("when GitHub cannot be reached", () => {
  it("says it could not check, rather than claiming to be up to date", async () => {
    stubCheck({
      installedVersion: "0.1.1",
      isCheckPossible: false,
      isUpdateAvailable: false,
      latestVersion: null,
      releaseUrl: null,
      reason: "GitHub could not be reached. This machine may not have access to it.",
    });

    render(<UpdatePanel />);

    expect(await screen.findByText(/could not be reached/i)).toBeTruthy();
    expect(screen.queryByText(/the newest version/i)).toBeNull();
  });

  it("still explains how to update by hand, so the machine is not stranded", async () => {
    stubCheck({
      installedVersion: "0.1.1",
      isCheckPossible: false,
      isUpdateAvailable: false,
      latestVersion: null,
      releaseUrl: null,
      reason: "GitHub could not be reached.",
    });

    render(<UpdatePanel />);

    expect(await screen.findByText(/extracting it over this folder/i)).toBeTruthy();
  });
});

describe("when it is already current", () => {
  it("says so without a button or a banner competing for attention", async () => {
    stubCheck({
      installedVersion: "0.1.1",
      isCheckPossible: true,
      isUpdateAvailable: false,
      latestVersion: "0.1.1",
      releaseUrl: null,
      reason: null,
    });

    render(<UpdatePanel />);

    expect(await screen.findByText(/the newest version/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("in the header, where it is seen on every screen", () => {
  it("says nothing at all when there is nothing to install", async () => {
    // A permanent "you are up to date" on every screen is noise, and noise in
    // the one place the important message will eventually appear trains people
    // to stop reading it.
    stubCheck({
      installedVersion: "0.8.1",
      isCheckPossible: true,
      isUpdateAvailable: false,
      latestVersion: "0.8.1",
      releaseUrl: null,
      reason: null,
    });

    const { container } = render(<UpdatePanel isQuietWhenCurrent />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("still speaks up when there IS something to install", async () => {
    // The whole reason it moved out of Setup: an update nobody sees is an update
    // nobody installs, and Setup is a screen somebody may not open for a week.
    stubCheck({
      installedVersion: "0.8.1",
      isCheckPossible: true,
      isUpdateAvailable: true,
      latestVersion: "0.9.0",
      releaseUrl: null,
      reason: null,
    });

    render(<UpdatePanel isQuietWhenCurrent />);

    expect(await screen.findByText(/0\.9\.0 is available/i)).toBeTruthy();
  });

  it("stays quiet when it could not check, rather than nagging on every screen", async () => {
    // Setup still says so, which is where somebody goes to find out.
    stubCheck({
      installedVersion: "0.8.1",
      isCheckPossible: false,
      isUpdateAvailable: false,
      latestVersion: null,
      releaseUrl: null,
      reason: "GitHub could not be reached.",
    });

    const { container } = render(<UpdatePanel isQuietWhenCurrent />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
