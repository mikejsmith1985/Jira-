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
function stubFetch(status: number, body: unknown, contentType = "application/json") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (name: string) => (name === "content-type" ? contentType : null) },
          text: async () => text,
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

describe("when Jira refuses in a shape we cannot read", () => {
  // The residue of the empty-body bug. Jira's answer to a request that malformed
  // carried no errorMessages at all, so the screen said "Jira answered with
  // status 400" and stopped - which is the message this product exists to
  // remove, produced by the product.
  it("shows what came back rather than only the status", async () => {
    stubFetch(400, "Missing the fields the create needs.", "text/plain");

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages.join(" ")).toContain("Missing the fields the create needs.");
  });

  it("does not invent a message when the refusal came with nothing at all", async () => {
    stubFetch(400, "", "text/plain");

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages).toEqual([]);
  });

  it("says nothing extra when Jira DID explain itself", async () => {
    // The raw body would only repeat what was already read out of it.
    stubFetch(400, JSON.stringify({ errors: { summary: "is required" } }), "application/json");

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages).toEqual(["summary: is required"]);
  });

  it("cuts a page of HTML down rather than pasting it onto the screen", async () => {
    stubFetch(400, `<html>${"x".repeat(2000)}</html>`, "text/html");

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.jiraMessages[0]!.length).toBeLessThan(400);
  });
});

describe("the diagnosis attached to a refusal", () => {
  // "Can't you produce an error that would actually help us fix this?" A status
  // code cannot be diagnosed. What went out and what came back can.
  it("carries what was sent, so the request can be read rather than guessed at", async () => {
    stubFetch(400, {
      errorMessages: [],
      jiraPlusSent: { method: "POST", path: "/rest/api/2/issue", body: { fields: { a: 1 } } },
    });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.failureDiagnosis?.sentBody).toEqual({ fields: { a: 1 } });
    expect(response.failureDiagnosis?.sentPath).toBe("/rest/api/2/issue");
  });

  it("carries Jira's reply verbatim, including the parts nothing knows how to read", async () => {
    stubFetch(400, { errorMessages: ["No."], jiraPlusSent: { method: "POST", path: "/x" } });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.failureDiagnosis?.rawReply).toContain("No.");
  });

  it("is absent when the request worked, so a good reply is left alone", async () => {
    stubFetch(201, { key: "DENP-1" });

    const response = await createBrowserJiraTransport().post("/rest/api/2/issue", {});

    expect(response.failureDiagnosis ?? null).toBeNull();
  });
});
