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

/** How much of an unreadable refusal to show before it stops being a message. */
const RAW_REASON_LIMIT = 300;

/**
 * Pulls Jira's own error text out of whatever shape came back.
 *
 * BOTH places are read, and this is not defensive tidiness. A create Jira
 * refuses answers with the reason in `errors`, keyed by field, and
 * `errorMessages` as an EMPTY ARRAY. An earlier version checked
 * `Array.isArray(errorMessages)` first, found the empty array, and returned it —
 * so the reason sat one property away while the screen said "Jira answered with
 * status 400" and nothing else.
 *
 * That is the exact useless message this product exists to remove, produced by
 * the product itself.
 */
function readJiraMessages(body: unknown): readonly string[] {
  if (body === null || typeof body !== "object") return [];

  const collected: string[] = [];

  const messages = (body as { errorMessages?: unknown }).errorMessages;
  if (Array.isArray(messages)) collected.push(...messages.map(String));

  const errors = (body as { errors?: Record<string, unknown> }).errors;
  if (errors !== undefined && errors !== null && typeof errors === "object") {
    // Named by field, because "cannot be set" tells somebody nothing about
    // WHICH field they have to go and look at.
    collected.push(
      ...Object.entries(errors).map(([field, message]) => `${field}: ${String(message)}`),
    );
  }

  // Some refusals carry a single sentence instead, under a name of their own.
  for (const key of ["message", "errorMessage", "error"] as const) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) collected.push(value);
  }

  return collected;
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

/**
 * What a refusal said, when it said it in no shape we recognise.
 *
 * A bare status is the message this product exists to remove. If Jira answered
 * with plain text, or a page, that text is worth more than the number on its
 * own - trimmed, because a page of HTML on screen is not a message either.
 */
function readRawReason(rawText: string): readonly string[] {
  const trimmed = rawText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return [];
  return [trimmed.slice(0, RAW_REASON_LIMIT)];
}

/** Turns one fetch into the engine's response shape. */
async function toJiraResponse<TBody>(response: Response): Promise<JiraResponse<TBody>> {
  // Read as text FIRST, so a refusal that is not JSON still has its words.
  // Reading it as JSON consumed the body and left nothing to fall back on.
  const rawText = await response.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    // A body that is not JSON is not an error in itself; the text still speaks.
  }

  const messages = readJiraMessages(body);
  // The raw text is a LAST resort, used only when the body could not be read as
  // JSON at all. Echoing back a JSON object we did understand, and which simply
  // held no reason, would add noise rather than an explanation.
  const isUnreadable = body === null && !response.ok;
  return {
    statusCode: response.status,
    body: response.ok ? (body as TBody) : null,
    jiraMessages: messages.length === 0 && isUnreadable ? readRawReason(rawText) : messages,
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
