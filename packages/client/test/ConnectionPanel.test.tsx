// connectionPanel.test.tsx — The screen that was missing, and the rule it keeps.
//
// Jira+ shipped with no way to enter a Jira address or a token. The panel that
// fixes that carries one rule worth asserting rather than trusting: the token is
// write-only. It is never sent to the browser, so the field is empty even when a
// token is stored, and an empty field on save means "unchanged" — not "delete".
//
// That last one is the defect worth a test. Somebody correcting a typo in the
// address would otherwise wipe their credential, and the only symptom would be
// everything quietly failing to load afterwards.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionPanel } from "../src/components/ConnectionPanel.js";

afterEach(cleanup);

/** What the server says about a connection in a given state. */
function buildConnection(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: "",
    isTokenPresent: false,
    isSslVerified: true,
    isJiraConfigured: false,
    port: 5556,
    ...overrides,
  };
}

/** Records every request the panel makes, and answers each one. */
function stubServer(connection: Record<string, unknown>) {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body === undefined ? {} : JSON.parse(String(init.body)),
      });
      return { ok: true, json: async () => connection } as Response;
    }),
  );

  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe("before anything is configured", () => {
  it("says nothing else can load, rather than leaving a blank screen", async () => {
    stubServer(buildConnection());
    render(<ConnectionPanel />);

    expect(await screen.findByText(/not configured yet/i)).toBeTruthy();
  });

  it("offers a field for the address and a field for the token", async () => {
    stubServer(buildConnection());
    render(<ConnectionPanel />);

    expect(await screen.findByLabelText(/your jira address/i)).toBeTruthy();
    expect(screen.getByLabelText(/personal access token/i)).toBeTruthy();
  });
});

describe("the token is write-only", () => {
  it("leaves the field empty when a token is stored, and says one is stored", async () => {
    stubServer(buildConnection({ baseUrl: "https://jira.example.org", isTokenPresent: true }));
    render(<ConnectionPanel />);

    const field = (await screen.findByLabelText(/personal access token/i)) as HTMLInputElement;

    expect(field.value).toBe("");
    expect(field.placeholder).toMatch(/a token is stored/i);
  });

  it("is masked, so it cannot be read over a shoulder or in a screen share", async () => {
    stubServer(buildConnection());
    render(<ConnectionPanel />);

    const field = (await screen.findByLabelText(/personal access token/i)) as HTMLInputElement;

    expect(field.type).toBe("password");
  });
});

describe("saving", () => {
  it("sends an empty token when the field was left alone, so the stored one survives", async () => {
    // The server reads an absent token as "unchanged". This asserts the panel
    // actually leaves it absent rather than sending a blank that could be read
    // as a deletion by any future change to that route.
    const calls = stubServer(
      buildConnection({ baseUrl: "https://jira.example.org", isTokenPresent: true }),
    );
    render(<ConnectionPanel />);

    await screen.findByLabelText(/your jira address/i);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const save = await waitFor(() => {
      const found = calls.find((call) => call.method === "PUT");
      expect(found).toBeDefined();
      return found!;
    });

    expect(save.body.personalAccessToken).toBe("");
    expect(save.body.baseUrl).toBe("https://jira.example.org");
  });

  it("clears the entered token from the page once it has been saved", async () => {
    stubServer(buildConnection({ baseUrl: "https://jira.example.org", isJiraConfigured: true }));
    render(<ConnectionPanel />);

    const field = (await screen.findByLabelText(/personal access token/i)) as HTMLInputElement;
    await userEvent.type(field, "not-a-real-token-for-tests-only");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(field.value).toBe(""));
  });
});

describe("testing the connection", () => {
  it("reports who Jira says you are, rather than merely that it worked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/test")
          ? ({
              ok: true,
              json: async () => ({
                isReachable: true,
                isAuthenticated: true,
                detail: "Signed in as Mike Smith.",
              }),
            } as Response)
          : ({ ok: true, json: async () => buildConnection() } as Response),
      ),
    );

    render(<ConnectionPanel />);
    await screen.findByLabelText(/your jira address/i);
    await userEvent.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/signed in as mike smith/i)).toBeTruthy();
  });

  it("shows the refusal verbatim when Jira rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/test")
          ? ({
              ok: true,
              json: async () => ({
                isReachable: true,
                isAuthenticated: false,
                detail: "Jira rejected the token.",
              }),
            } as Response)
          : ({ ok: true, json: async () => buildConnection() } as Response),
      ),
    );

    render(<ConnectionPanel />);
    await screen.findByLabelText(/your jira address/i);
    await userEvent.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/jira rejected the token/i)).toBeTruthy();
  });
});
