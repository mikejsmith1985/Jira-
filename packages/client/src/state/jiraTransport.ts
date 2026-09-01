// jiraTransport.ts — How the browser reaches Jira: through our own server.
//
// Every request goes to /jira-proxy, which attaches the credential on the far
// side. Nothing here holds a token, and there is no code path in this bundle
// that could — which is why the browser never has one to leak.
//
// A non-2xx reply is returned as a value rather than thrown. The engine's typed
// failures depend on seeing the status and Jira's own words, and an exception
// would discard both.

import type { JiraResponse, JiraTransport } from "@jira-plus/core";

/** The path prefix the local server forwards to Jira. */
const PROXY_PREFIX = "/jira-proxy";

/** Pulls Jira's own error text out of whatever shape came back. */
function readJiraMessages(body: unknown): readonly string[] {
  if (body === null || typeof body !== "object") return [];
  const messages = (body as { errorMessages?: unknown }).errorMessages;
  if (Array.isArray(messages)) return messages.map(String);

  const errors = (body as { errors?: Record<string, unknown> }).errors;
  if (errors !== undefined && errors !== null && typeof errors === "object") {
    return Object.entries(errors).map(([field, message]) => `${field}: ${String(message)}`);
  }
  return [];
}

/**
 * Reads the marker our own proxy sets when IT refused rather than Jira.
 *
 * Jira cannot set this field, so it is the one signal that separates an
 * unfinished setup from a genuine outage sharing the same status code.
 */
function readJiraPlusFailureKind(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const kind = (body as { jiraPlusFailureKind?: unknown }).jiraPlusFailureKind;
  return typeof kind === "string" ? kind : null;
}

/** Reads Retry-After, which distinguishes throttling from an empty result. */
function readRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) return null;
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Turns one fetch into the engine's response shape. */
async function toJiraResponse<TBody>(response: Response): Promise<JiraResponse<TBody>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A body that is not JSON is not an error in itself; the status still speaks.
  }

  return {
    statusCode: response.status,
    body: response.ok ? (body as TBody) : null,
    jiraMessages: readJiraMessages(body),
    retryAfterSeconds: readRetryAfterSeconds(response),
    jiraPlusFailureKind: readJiraPlusFailureKind(body),
  };
}

/** Creates the browser transport. It knows one origin: our own. */
export function createBrowserJiraTransport(): JiraTransport {
  return {
    async get<TBody>(pathAndQuery: string): Promise<JiraResponse<TBody>> {
      return toJiraResponse<TBody>(await fetch(`${PROXY_PREFIX}${pathAndQuery}`));
    },

    async post<TBody>(pathAndQuery: string, body: unknown): Promise<JiraResponse<TBody>> {
      return toJiraResponse<TBody>(
        await fetch(`${PROXY_PREFIX}${pathAndQuery}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },

    async put(pathAndQuery: string, body: unknown): Promise<JiraResponse<void>> {
      return toJiraResponse<void>(
        await fetch(`${PROXY_PREFIX}${pathAndQuery}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
  };
}

export { PROXY_PREFIX };
