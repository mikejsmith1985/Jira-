// jiraTransport.test.ts — Jira's own words, or the reason is lost.
//
// A create that Jira refuses answers 400 with the reason in `errors`, keyed by
// field, and `errorMessages` as an EMPTY ARRAY. The extractor checked
// `Array.isArray(errorMessages)` first, found an empty array, and returned it —
// never reaching the map where the reason actually was.
//
// The visible result was "Jira answered with status 400" and nothing else: the
// exact useless message this product exists to remove, produced by the product
// itself, with the explanation sitting one property away.

import { describe, expect, it, vi } from "vitest";

import { createBrowserJiraTransport } from "../src/state/jiraTransport.js";

/** Answers one request with the given status and body. */
function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: () => null },
          json: async () => body,
        }) as unknown as Response,
    ),
  );
}

describe("when Jira refuses a create", () => {
  it("reads the reason out of the per-field errors", async () => {
    // The shape Jira actually returns: the reason in `errors`, and
    // `errorMessages` empty.
    stubFetch(400, {
      errorMessages: [],
      errors: {
        customfield_10500: "Field 'customfield_10500' cannot be set. It is not on the appropriate screen, or unknown.",
      },
    });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages.join(" ")).toContain("not on the appropriate screen");
  });

  it("names the field, so the reason is actionable rather than merely present", async () => {
    stubFetch(400, { errorMessages: [], errors: { summary: "You must specify a summary." } });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages.at(0)).toContain("summary");
  });

  it("still reads a general message when Jira sends one", async () => {
    stubFetch(400, { errorMessages: ["Issue type is required."], errors: {} });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages).toEqual(["Issue type is required."]);
  });

  it("reads BOTH when Jira sends both, rather than choosing one", async () => {
    stubFetch(400, {
      errorMessages: ["The issue could not be created."],
      errors: { summary: "You must specify a summary." },
    });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    const combined = response.jiraMessages.join(" ");
    expect(combined).toContain("could not be created");
    expect(combined).toContain("must specify a summary");
  });

  it("says nothing rather than inventing when Jira sends no reason at all", async () => {
    stubFetch(400, { errorMessages: [], errors: {} });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages).toHaveLength(0);
  });
});
