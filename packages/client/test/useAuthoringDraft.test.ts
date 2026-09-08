// useAuthoringDraft.test.ts — Nobody loses the paragraph they just wrote.
//
// The draft is saved to the server rather than held in the page, because it has
// to survive three things: a reload, a restart of the application, and being
// navigated away from — which is what activating the relay bookmarklet does,
// every time.
//
// The save is debounced, and that is not a performance concern. It makes a save
// one request per pause in typing rather than one per keystroke. Losing the last
// half-second to a crash is acceptable; losing the paragraph is not.

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthoringDraft } from "../src/state/useAuthoringDraft.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.unstubAllGlobals());

/** A draft as the server stores one. */
const STORED = {
  existingIssueKey: null,
  summary: "Show enrolment status",
  description: "",
  acceptanceCriteria: "",
  operatorNarrative: "Jana says members ring in every time a plan changes.",
  projectKey: "",
  issueTypeId: "",
  fieldValues: {},
  sources: [],
  loadedFieldValues: null,
  updatedAtIso: "2026-09-08T09:14:00.000Z",
};

/** Answers the draft route, recording every call. */
function stubServer(stored: unknown) {
  const fetchSpy = vi.fn(
    async (unusedUrl?: string, unusedInit?: RequestInit) =>
      ({ ok: true, json: async () => ({ draft: stored }) }) as Response,
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("what was already written", () => {
  it("comes back, so a reload is invisible", async () => {
    stubServer(STORED);

    const { result } = renderHook(() => useAuthoringDraft());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.draft.summary).toBe("Show enrolment status");
  });

  it("starts empty when nothing was stored, which is the normal first state", async () => {
    stubServer(null);

    const { result } = renderHook(() => useAuthoringDraft());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.draft.summary).toBe("");
  });

  it("starts empty rather than blank-screening when the server cannot be reached", async () => {
    // An unreachable server leaves the same state as never having written a
    // draft, which is strictly better than an error somebody cannot act on.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const { result } = renderHook(() => useAuthoringDraft());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.draft.summary).toBe("");
  });
});

describe("keeping it", () => {
  it("saves after typing pauses, not on every keystroke", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = stubServer(null);

    const { result } = renderHook(() => useAuthoringDraft());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.update({ summary: "S" }));
    act(() => result.current.update({ summary: "Sh" }));
    act(() => result.current.update({ summary: "Sho" }));

    const before = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT").length;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const after = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT").length;

    expect(before).toBe(0);
    expect(after).toBe(1);
  });

  it("applies each edit to the draft immediately, whatever the save is doing", async () => {
    // The save is allowed to lag. The screen is not.
    stubServer(null);

    const { result } = renderHook(() => useAuthoringDraft());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.update({ summary: "Show enrolment status" }));

    expect(result.current.draft.summary).toBe("Show enrolment status");
  });
});

describe("discarding", () => {
  it("clears the draft and tells the server", async () => {
    const fetchSpy = stubServer(STORED);

    const { result } = renderHook(() => useAuthoringDraft());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.discard();
    });

    expect(result.current.draft.summary).toBe("");
    expect(
      fetchSpy.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(true);
  });
});
