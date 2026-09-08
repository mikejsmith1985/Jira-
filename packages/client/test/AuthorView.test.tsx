// AuthorView.test.tsx — The screen says which thing it is about to do.
//
// The failure this guards against looks exactly like success: somebody loads a
// one-line stub meaning to improve it, and ends up with two Features describing
// the same work. Nobody notices until a colleague finds the second one.
//
// So the screen states, in plain words and at all times, whether it will create
// a new issue or update a named one — and it takes that from the same single
// field the change set does, so the words on screen and the behaviour cannot
// disagree.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorView } from "../src/views/AuthorView.js";

afterEach(cleanup);
beforeEach(() => vi.unstubAllGlobals());

/** Answers the draft route, and refuses anything reaching Jira. */
function stubServer(storedDraft: unknown = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/authoring/draft")) {
        return { ok: true, json: async () => ({ draft: storedDraft }) } as Response;
      }
      // Nothing in this suite should reach Jira; if something does, it fails
      // loudly rather than quietly succeeding against a stub.
      return { ok: false, status: 503, json: async () => ({ errorMessages: [] }) } as Response;
    }),
  );
}

/** A draft mid-sentence, as one is actually stored. */
function buildStoredDraft(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe("saying what it is about to do", () => {
  it("says a new issue will be created when no key names an existing one", async () => {
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    expect(await screen.findByText(/writing a new issue/i)).toBeTruthy();
  });

  it("says it will update the named issue, and will not create a second", async () => {
    stubServer(buildStoredDraft({ existingIssueKey: "ENCUC-1142" }));
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    expect(await screen.findByText(/updating ENCUC-1142/i)).toBeTruthy();
    expect(screen.getByText(/will not create a second one/i)).toBeTruthy();
  });

  it("changes what it says the moment the key is typed", async () => {
    // The words and the behaviour come from one field, so they cannot disagree.
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    await userEvent.type(await screen.findByLabelText(/its key here/i), "ENCUC-1142");

    await waitFor(() => expect(screen.getByText(/updating ENCUC-1142/i)).toBeTruthy());
  });
});

describe("the draft that was already there", () => {
  it("comes back after a reload, rather than starting empty", async () => {
    // The restart case and the relay-navigation case. Losing this is losing the
    // paragraph somebody just wrote.
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    const summary = (await screen.findByLabelText(/^summary$/i)) as HTMLInputElement;

    expect(summary.value).toBe("Show enrolment status");
  });

  it("keeps the operator's own words, which never reach Jira", async () => {
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    const narrative = (await screen.findByLabelText(/your own words/i)) as HTMLTextAreaElement;

    expect(narrative.value).toContain("Jana");
  });
});

describe("before anything can be written", () => {
  it("refuses a draft with no project or issue type, and says why", async () => {
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    await userEvent.click(await screen.findByRole("button", { name: /what will change/i }));

    expect(await screen.findByText(/nothing will be written yet/i)).toBeTruthy();
    // The reason appears both in the blocker list and in the diff, which is
    // the point - it is stated wherever somebody is looking.
    expect(screen.getAllByText(/choose the project/i).length).toBeGreaterThan(0);
  });

  it("names a missing summary as a reason rather than failing later", async () => {
    stubServer(buildStoredDraft({ summary: "" }));
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    await userEvent.click(await screen.findByRole("button", { name: /what will change/i }));

    expect((await screen.findAllByText(/an issue needs a summary/i)).length).toBeGreaterThan(0);
  });
});

describe("gathering material", () => {
  it("keeps a pasted source with the label it was given", async () => {
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    await userEvent.type(await screen.findByLabelText(/what is it/i), "the brief");
    await userEvent.type(screen.getByLabelText(/paste it here/i), "Members cannot see it.");
    await userEvent.click(screen.getByRole("button", { name: /add it/i }));

    expect(await screen.findByText("the brief")).toBeTruthy();
    expect(screen.getByText(/members cannot see it/i)).toBeTruthy();
  });

  it("says plainly that gathered material is never written to Jira", async () => {
    stubServer(buildStoredDraft());
    render(<AuthorView configuration={null} jiraBaseUrl="" />);

    // Said beside the gathered material and again beside the narrative,
    // because both are things somebody might assume reach Jira.
    expect((await screen.findAllByText(/never written to jira/i)).length).toBeGreaterThan(0);
  });
});
