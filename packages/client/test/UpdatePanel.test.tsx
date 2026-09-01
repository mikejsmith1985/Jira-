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
