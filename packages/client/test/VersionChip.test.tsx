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

/** Answers the check, the install, and — once restarting — who is running. */
function stubServer(
  check: unknown,
  install?: { isOk: boolean; body: unknown },
  instanceVersion?: string,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("install")) {
        return { ok: install?.isOk ?? false, json: async () => install?.body ?? {} };
      }
      if (url.includes("instance")) {
        if (instanceVersion === undefined) throw new Error("nothing is listening");
        return { ok: true, json: async () => ({ version: instanceVersion }) };
      }
      return { ok: true, json: async () => check };
    }),
  );
}

/** A check saying 0.9.2 is there to be had. */
const UPDATE_WAITING = {
  installedVersion: "0.9.1",
  isCheckPossible: true,
  isUpdateAvailable: true,
  latestVersion: "0.9.2",
  reason: null,
};

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
      { isOk: true, body: { installedVersion: "0.9.2" } },
    );

    render(<VersionChip />);
    await userEvent.click(await screen.findByRole("button", { name: /update to 0\.9\.2/i }));

    await waitFor(() => expect(screen.getByText(/0\.9\.2 ready — restart/i)).toBeTruthy());
  });
});

describe("after installing", () => {
  // "This defeats the purpose of an update if I still have to go launch it
  // myself." The install worked and then handed back a chore.
  it("restarts by itself rather than asking somebody to go and launch it", async () => {
    stubServer(
      UPDATE_WAITING,
      { isOk: true, body: { installedVersion: "0.9.2", isRestarting: true } },
      "0.9.1",
    );

    render(<VersionChip />);
    await userEvent.click(await screen.findByRole("button", { name: /update to 0\.9\.2/i }));

    expect(await screen.findByText(/restarting/i)).toBeTruthy();
  });

  it("reloads the page once the new version is the one answering", async () => {
    // Not when the port answers - the OLD copy answers right up until it exits,
    // so reloading on that would put the new interface's expectations against
    // the old server.
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    stubServer(
      UPDATE_WAITING,
      { isOk: true, body: { installedVersion: "0.9.2", isRestarting: true } },
      "0.9.2",
    );

    render(<VersionChip />);
    await userEvent.click(await screen.findByRole("button", { name: /update to 0\.9\.2/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("still asks for a restart when it could not do one itself", async () => {
    // Running from source, or the scripting host missing. Saying nothing would
    // leave somebody looking at an old version believing it had updated.
    stubServer(UPDATE_WAITING, {
      isOk: true,
      body: { installedVersion: "0.9.2", isRestarting: false },
    });

    render(<VersionChip />);
    await userEvent.click(await screen.findByRole("button", { name: /update to 0\.9\.2/i }));

    expect(await screen.findByText(/0\.9\.2 ready — restart/i)).toBeTruthy();
  });

  it("says WHY it could not, rather than asking again and explaining nothing", async () => {
    // "Why do I still have to restart the app manually? you said that was going
    // to be fixed like 3 versions ago." It had been declining to hand over and
    // saying nothing about it, so there was nothing to act on and no way to
    // tell a broken handover from one that was never attempted.
    stubServer(UPDATE_WAITING, {
      isOk: true,
      body: {
        installedVersion: "0.9.2",
        isRestarting: false,
        restartReason: "The restart could not be started: wscript.exe is missing.",
      },
    });

    render(<VersionChip />);
    await userEvent.click(await screen.findByRole("button", { name: /update to 0\.9\.2/i }));

    const chip = await screen.findByTitle(/wscript\.exe is missing/i);
    expect(chip).toBeTruthy();
  });
});
