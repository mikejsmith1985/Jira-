// fieldWriters.ts — Jira's field shapes, absorbed in one place.
//
// Jira is not uniform about how a field is written. A single-select wants
// `{ id }` rather than a string. Fix versions must go through `update.set`
// rather than `fields`. Story points may be a number on one instance and a
// dropdown on another. Each of those is a real inconsistency, and each has to
// live somewhere.
//
// It lives here, once. One router picks the writer, so a field written from a
// hygiene fix and the same field written from a pack produce byte-identical
// requests — because two code paths writing one field is how two surfaces come
// to disagree about what a successful write looks like.

import type { JiraResponse, JiraTransport } from "../jiraAdapter.js";
import type { WriteRoute } from "../../apply/buildChangeSet.js";

/** What every writer receives. */
export interface FieldWriteRequest {
  readonly issueKey: string;
  readonly fieldId: string;
  readonly value: unknown;
}

/** One writer. */
export type FieldWriter = (
  request: FieldWriteRequest,
  transport: JiraTransport,
) => Promise<JiraResponse<void>>;

/** The issue-editing endpoint for one issue. */
function buildIssuePath(issueKey: string): string {
  return `/rest/api/2/issue/${encodeURIComponent(issueKey)}`;
}

/** Plain text, numbers and dates: the field id takes the value directly. */
const writeSimpleField: FieldWriter = async (request, transport) =>
  transport.put(buildIssuePath(request.issueKey), {
    fields: { [request.fieldId]: request.value },
  });

/**
 * Single-select fields.
 *
 * Jira wants an object, not the label. Sending the string looks like it works —
 * it returns 200 and changes nothing — which is the worst kind of failure.
 */
const writeOptionField: FieldWriter = async (request, transport) =>
  transport.put(buildIssuePath(request.issueKey), {
    fields: { [request.fieldId]: { value: String(request.value) } },
  });

/**
 * User fields.
 *
 * Data Center identifies a user by `name`; Cloud by `accountId`. Both are sent,
 * and Jira ignores the one it does not recognise — which is preferable to
 * guessing the deployment from inside a writer.
 */
const writeUserField: FieldWriter = async (request, transport) =>
  transport.put(buildIssuePath(request.issueKey), {
    fields: { [request.fieldId]: { name: String(request.value), accountId: String(request.value) } },
  });

/**
 * Fix versions.
 *
 * Must use `update.set` rather than `fields`. Through `fields` Jira accepts the
 * request and silently does nothing on many configurations, which is exactly the
 * class of quiet failure this product exists to remove.
 */
const writeFixVersionField: FieldWriter = async (request, transport) => {
  const versions = Array.isArray(request.value) ? request.value : [request.value];
  return transport.put(buildIssuePath(request.issueKey), {
    update: {
      fixVersions: [{ set: versions.map((version) => ({ name: String(version) })) }],
    },
  });
};

/**
 * Story points.
 *
 * A number on most instances, a dropdown on some. A numeric value is sent as a
 * number; anything else is sent as an option, because a dropdown rejects a bare
 * number and a numeric field rejects an object.
 */
const writeStoryPointsField: FieldWriter = async (request, transport) => {
  const numeric = Number(request.value);
  const payload = Number.isFinite(numeric)
    ? { [request.fieldId]: numeric }
    : { [request.fieldId]: { value: String(request.value) } };
  return transport.put(buildIssuePath(request.issueKey), { fields: payload });
};

/** Issue links, which are their own endpoint rather than a field. */
const writeIssueLinkField: FieldWriter = async (request, transport) =>
  transport.put(buildIssuePath(request.issueKey), {
    update: { issuelinks: [{ add: { type: { name: "Relates" }, outwardIssue: { key: String(request.value) } } }] },
  });

/** Every writer, by the route that selects it. */
const WRITERS: Readonly<Record<WriteRoute, FieldWriter>> = {
  simple: writeSimpleField,
  option: writeOptionField,
  user: writeUserField,
  fixVersion: writeFixVersionField,
  storyPoints: writeStoryPointsField,
  issueLink: writeIssueLinkField,
  // A transition is not a field write; the apply pipeline routes it separately.
  transition: writeSimpleField,
};

/**
 * Picks the writer for a route.
 *
 * One router, so the same field written from two surfaces produces identical
 * requests. That is the property that stops two screens disagreeing about what a
 * successful write looks like.
 */
export function resolveFieldWriteRoute(route: WriteRoute): FieldWriter {
  return WRITERS[route];
}

/**
 * Chooses a route from what is known about a field.
 *
 * Used when a proposal does not name one. Conservative on purpose: an unknown
 * shape is written simply, which fails loudly rather than succeeding wrongly.
 */
export function inferWriteRoute(fieldId: string, schemaType: string | undefined): WriteRoute {
  if (fieldId === "fixVersions") return "fixVersion";
  if (fieldId === "issuelinks") return "issueLink";
  if (schemaType === "option") return "option";
  if (schemaType === "user") return "user";
  return "simple";
}

export { writeFixVersionField, writeOptionField, writeSimpleField, writeStoryPointsField, writeUserField };
