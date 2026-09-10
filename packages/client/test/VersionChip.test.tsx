// VersionChip.test.tsx — An empty space is indistinguishable from a broken feature.
//
// The update notice used to render nothing at all when there was nothing to
// install. That is correct behaviour and it was read as a missing feature:
// somebody running the newest version saw blank space, concluded the updater
// did not work, and carried on downloading zips by hand.
//
// So the assertion that matters is the boring one — that the chip is there,
// saying which version is running, even when it has nothing to offer.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VersionChip } from "../src/components/VersionChip.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Answers the check, and the install if one is asked for. */
function stubServer(check: unknown, install?: { ok: boolean; body: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("install")) {
        return { ok: install?.ok ?? false, json: async () => install?.body ?? {} };
      }
      return { ok: true, json: async () => check };
    }),
  );
}

describe("when this is the newest version", () => {
  it("says so rather than showing nothing, which reads as a broken feature", async () => {
    stubServer({
      installedVersion: "0.9.1",
      isCheckPossible: true,
      isUpdateAvailable: false,
      latestVersion: "0.9.1",
      reason: null,
    });

    render(<VersionChip />);

    expect(await screen.findByText(/v0\.9\.1/)).toBeTruthy();
  });
});

describe("when the check could not be made", () => {
  it("still shows the running version, and says the check failed", async () => {
    // Silence here would be read the same way: the feature does not work.
    stubServer({
      installedVersion: "0.9.1",
      isCheckPossible: false,
      isUpdateAvailable: false,
      latestVersion: null,
      reason: "GitHub could not be reached.",
    });

    render(<VersionChip />);

    expect(await screen.findByText(/v0\.9\.1.*offline/)).toBeTruthy();
  });
});

describe("when something newer exists", () => {
  it("offers to install it, naming the version", async () => {
    stubServer({
      installedVersion: "0.9.1",
      isCheckPossible: true,
      isUpdateAvailable: true,
      latestVersion: "0.9.2",
      reason: null,
    });

    render(<VersionChip />);

    expect(await screen.findByRole("button", { name: /update to 0\.9\.2/i })).toBeTruthy();
  });

  it("says the new version is ready and needs a restart, not that it is running", async () => {
    // Claiming the update had taken effect would be a lie until the restart.
    stubServer(
      {
        installedVersion: "0.9.1",
        isCheckPossible: true,
        isUpdateAvailable: true,
        latestVersion: "0.9.2",
        reason: null,
      },
      { ok: true, body: { installedVersion: "0.9.2" } },
    );

    render(<VersionChip />);
    await userEvent.click(await screen.findByRole("button", { name: /update to 0\.9\.2/i }));

    await waitFor(() => expect(screen.getByText(/0\.9\.2 ready — restart/i)).toBeTruthy());
  });
});
