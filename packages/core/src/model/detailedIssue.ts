// detailedIssue.ts — One Jira issue, as retrieved, normalised only where Jira's
// own shapes are inconsistent.
//
// The type keeps two things separate that the predecessor collapsed. A field is
// addressable only by its real Jira id, so no rule can hold a guess about which
// field is which; and an unretrieved change history is `null` while a genuinely
// empty one is `[]`, because reading the first as the second is precisely how a
// missing fetch became a confident zero.

/** Jira's own three-way classification of any status, available on every instance. */
export type StatusCategoryKey = "new" | "indeterminate" | "done";

/** One field change inside a changelog entry. Only status and assignee are read today. */
export interface ChangelogItem {
  readonly field: string;
  readonly fromString: string | null;
  readonly toString: string | null;
  readonly fromId: string | null;
  readonly toId: string | null;
}

/** One moment at which an issue changed, with everything that changed in it. */
export interface ChangelogEntry {
  readonly atIso: string;
  readonly authorAccountId: string | null;
  readonly items: readonly ChangelogItem[];
}

/**
 * A retrieved Jira issue.
 *
 * `changelog` is `null` when history was not requested or could not be
 * retrieved, and an array — possibly empty — when it was. Callers must treat the
 * two differently: see `hasRetrievedChangelog`.
 */
export interface DetailedIssue {
  readonly key: string;
  readonly id: string;
  readonly issueTypeName: string;
  readonly statusName: string;
  readonly statusId: string;
  readonly statusCategoryKey: StatusCategoryKey;
  readonly projectKey: string;
  readonly createdIso: string;
  readonly resolutionDateIso: string | null;
  readonly assigneeAccountId: string | null;
  readonly fields: ReadonlyMap<string, unknown>;
  readonly fieldNames: ReadonlyMap<string, string>;
  readonly changelog: readonly ChangelogEntry[] | null;
}

/** The status categories Jira guarantees; anything else is treated as in-progress. */
const KNOWN_STATUS_CATEGORY_KEYS: readonly StatusCategoryKey[] = ["new", "indeterminate", "done"];

/**
 * Was this issue's change history actually retrieved?
 *
 * False means the history is unknown, which is not the same as the issue never
 * having changed. Flow measures must exclude and report such issues rather than
 * treat them as zero.
 */
export function hasRetrievedChangelog(issue: DetailedIssue): boolean {
  return issue.changelog !== null;
}

/** Reads a nested property without throwing when any level is absent. */
function readNested(source: unknown, ...path: readonly string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Coerces a value to a string, or returns the fallback when it is absent. */
function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** Coerces a value to a string, or null when Jira left it empty. */
function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Maps Jira's status category key onto ours, defaulting to in-progress. */
function readStatusCategoryKey(rawIssue: Record<string, unknown>): StatusCategoryKey {
  const rawKey = readNested(rawIssue, "fields", "status", "statusCategory", "key");
  const isKnown = KNOWN_STATUS_CATEGORY_KEYS.some((known) => known === rawKey);
  return isKnown ? (rawKey as StatusCategoryKey) : "indeterminate";
}

/**
 * Reads the assignee's stable identifier.
 *
 * Data Center exposes `name` or `key` where Cloud exposes `accountId`, so all
 * three are accepted. A `null` result is meaningful: nobody holds this issue.
 */
function readAssigneeIdentifier(rawIssue: Record<string, unknown>): string | null {
  const assignee = readNested(rawIssue, "fields", "assignee");
  if (assignee === null || typeof assignee !== "object") return null;
  const candidate = assignee as Record<string, unknown>;
  return (
    readOptionalString(candidate.accountId) ??
    readOptionalString(candidate.name) ??
    readOptionalString(candidate.key)
  );
}

/** Copies every field Jira returned, keyed by its real field id. */
function readFieldMap(rawIssue: Record<string, unknown>): ReadonlyMap<string, unknown> {
  const rawFields = rawIssue.fields;
  if (rawFields === null || typeof rawFields !== "object") return new Map();
  return new Map(Object.entries(rawFields as Record<string, unknown>));
}

/** Converts one raw history entry, keeping only the item properties we read. */
function normaliseChangelogEntry(rawEntry: Record<string, unknown>): ChangelogEntry {
  const rawItems = Array.isArray(rawEntry.items) ? rawEntry.items : [];
  return {
    atIso: readString(rawEntry.created, ""),
    authorAccountId: readAssigneeIdentifier({ fields: { assignee: rawEntry.author } }),
    items: rawItems.map((rawItem): ChangelogItem => {
      const item = rawItem as Record<string, unknown>;
      return {
        field: readString(item.field, ""),
        fromString: readOptionalString(item.fromString),
        toString: readOptionalString(item.toString),
        fromId: readOptionalString(item.from),
        toId: readOptionalString(item.to),
      };
    }),
  };
}

/**
 * Reads the change history, preserving the difference between "not retrieved"
 * and "no history", and ordering entries oldest first whatever order Jira used.
 */
function readChangelog(rawIssue: Record<string, unknown>): readonly ChangelogEntry[] | null {
  const histories = readNested(rawIssue, "changelog", "histories");
  if (!Array.isArray(histories)) return null;
  return histories
    .map((rawEntry) => normaliseChangelogEntry(rawEntry as Record<string, unknown>))
    .sort((first, second) => first.atIso.localeCompare(second.atIso));
}

/**
 * Converts one raw Jira issue into the shape every rule in Jira+ consumes.
 *
 * `fieldDisplayNames` comes from `expand=names` and lets a surface show Jira's
 * own label for whichever field a check actually read — which is what makes a
 * mapping auditable rather than merely configured.
 */
export function normaliseRawIssue(
  rawIssue: Record<string, unknown>,
  fieldDisplayNames: Readonly<Record<string, string>>,
): DetailedIssue {
  return {
    key: readString(rawIssue.key, ""),
    id: readString(rawIssue.id, ""),
    issueTypeName: readString(readNested(rawIssue, "fields", "issuetype", "name"), ""),
    statusName: readString(readNested(rawIssue, "fields", "status", "name"), ""),
    statusId: readString(readNested(rawIssue, "fields", "status", "id"), ""),
    statusCategoryKey: readStatusCategoryKey(rawIssue),
    projectKey: readString(readNested(rawIssue, "fields", "project", "key"), ""),
    createdIso: readString(readNested(rawIssue, "fields", "created"), ""),
    resolutionDateIso: readOptionalString(readNested(rawIssue, "fields", "resolutiondate")),
    assigneeAccountId: readAssigneeIdentifier(rawIssue),
    fields: readFieldMap(rawIssue),
    fieldNames: new Map(Object.entries(fieldDisplayNames)),
    changelog: readChangelog(rawIssue),
  };
}
