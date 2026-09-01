// InstancePanel.test.tsx — "Which one am I looking at, and how do I kill it?"
//
// Both questions had no answer on screen. Jira+ runs hidden, so telling one copy
// from another meant Task Manager, and stopping one meant Task Manager too.
//
// The process id is the load-bearing detail. A Stop button that fails leaves
// somebody with nothing to act on unless the page has already told them exactly
// which process to end.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstancePanel } from "../src/components/InstancePanel.js";

afterEach(cleanup);
beforeEach(() => vi.unstubAllGlobals());

/** The running copy, as the server describes it. */
const INSTANCE = {
  processId: 12345,
  port: 5556,
  startedAtIso: "2026-09-01T09:14:00.000Z",
};

/** Answers /api/instance, and optionally the stop request. */
function stubInstance() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? ({ ok: true, json: async () => ({ isStopping: true }) } as Response)
        : ({ ok: true, json: async () => INSTANCE } as Response),
    ),
  );
}

describe("naming the running copy", () => {
  it("shows the port, so a browser tab can be matched to a process", async () => {
    stubInstance();
    render(<InstancePanel />);

    expect(await screen.findByText(/port 5556/i)).toBeTruthy();
  });

  it("shows the process id, so it can still be ended if the button fails", async () => {
    stubInstance();
    render(<InstancePanel />);

    expect(await screen.findByText("12345")).toBeTruthy();
  });

  it("says a second launch reopens this copy rather than starting another", async () => {
    // Somebody who believes they have five copies running will go hunting for
    // four that do not exist.
    stubInstance();
    render(<InstancePanel />);

    expect(await screen.findByText(/rather than a second one/i)).toBeTruthy();
  });
});

describe("stopping it", () => {
  it("confirms it stopped and says how to start it again", async () => {
    stubInstance();
    render(<InstancePanel />);

    await userEvent.click(await screen.findByRole("button", { name: /stop jira\+/i }));

    await waitFor(() => expect(screen.getByText(/jira\+ has stopped/i)).toBeTruthy());
    expect(screen.getByText(/launch jira plus/i)).toBeTruthy();
  });

  it("still reports success when the connection drops, because that IS the exit", async () => {
    // The process going away mid-request is the expected outcome, not a failure.
    // Reporting it as an error would make a working Stop button look broken.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") throw new Error("network error");
        return { ok: true, json: async () => INSTANCE } as Response;
      }),
    );

    render(<InstancePanel />);
    await userEvent.click(await screen.findByRole("button", { name: /stop jira\+/i }));

    await waitFor(() => expect(screen.getByText(/jira\+ has stopped/i)).toBeTruthy());
  });
});

describe("when the copy cannot describe itself", () => {
  it("renders nothing rather than an empty box", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));

    const { container } = render(<InstancePanel />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
