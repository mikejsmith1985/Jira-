// fetchIssueSet.ts — One query in, one frozen snapshot out.
//
// This is the only function in Jira+ that turns a JQL string into data. Every
// other module is a pure function over what it produces, which is what makes the
// predecessor's defining defect unreachable: there is no second query to go
// wrong, so a broken field reference cannot quietly become a green score.
//
// Whatever happens here is reported rather than thrown. A failure travels as a
// value, into the retrieval record, into every measure's provenance, and onto
// the screen — carrying Jira's own words, because Jira's message is more useful
// than anything this tool could paraphrase.

import { normaliseRawIssue } from "../model/detailedIssue.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../model/issueSet.js";
import type { ChangelogCoverage, IssueSet, RetrievalFailure } from "../model/issueSet.js";
import type { FieldMap, WorkspaceConfiguration } from "../workspace/workspaceConfig.js";
import { computeFingerprint } from "../workspace/workspaceConfig.js";
import { fetchIssuesPaged } from "./fetchIssuesPaged.js";
import type { FieldSelection, JiraAdapter, JiraResponse } from "./jiraAdapter.js";

/** How many per-issue history requests run at once when a search omits changelog. */
const CHANGELOG_FETCH_CONCURRENCY = 6;

/** HTTP status meanings this module maps onto typed failures. */
const HTTP_UNAUTHORISED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;

/** What a caller asks for. */
export interface FetchIssueSetInput {
  readonly jql: string;
  readonly fieldSelection: FieldSelection;
  readonly doesRequireChangelog: boolean;
  readonly configuration: WorkspaceConfiguration;
  /** Reported so a caller can show progress on a long retrieval. */
  readonly onProgress?: (fetchedCount: number, totalMatchingCount: number) => void;
}

/**
 * Turns an HTTP reply into a typed failure.
 *
 * Five kinds, because each asks something different of the reader. A permission
 * problem shown as an empty backlog is the specific mistake this mapping exists
 * to prevent; an unfinished setup shown as a Jira outage is the second.
 */
function classifyFailure(response: JiraResponse<unknown>): RetrievalFailure | null {
  if (response.statusCode >= 200 && response.statusCode < 300) return null;

  // Checked FIRST, and by marker rather than status code: Jira can return a
  // 503 of its own, and telling somebody to finish setup while Jira is down
  // wastes their afternoon as surely as the reverse.
  if (response.jiraPlusFailureKind === "not-configured") return { kind: "not-configured" };

  if (response.statusCode === HTTP_UNAUTHORISED) return { kind: "authentication" };

  if (response.statusCode === HTTP_FORBIDDEN) {
    return { kind: "permission", projectKeys: [] };
  }

  if (response.statusCode === HTTP_TOO_MANY_REQUESTS) {
    const failure: RetrievalFailure = {
      kind: "transport",
      message: "Jira is rate limiting this client. The retrieval stopped rather than guessing.",
    };
    return response.retryAfterSeconds === null
      ? failure
      : { ...failure, retryAfterSeconds: response.retryAfterSeconds };
  }

  if (response.statusCode === HTTP_BAD_REQUEST) {
    return { kind: "jql-error", jiraMessages: response.jiraMessages };
  }

  return {
    kind: "transport",
    message:
      response.jiraMessages[0] ?? `Jira answered with status ${response.statusCode}.`,
  };
}

/** Every field id the retrieval must request, whatever the caller thought to ask for. */
function resolveRequestedFields(
  fieldSelection: FieldSelection,
  fieldMap: FieldMap,
): FieldSelection {
  if (fieldSelection.kind === "all") return fieldSelection;

  // A concept the user has confirmed is always retrieved. Otherwise a check
  // could report "not measurable" purely because a caller forgot to ask.
  const mappedFieldIds = Object.values(fieldMap)
    .filter((entry) => entry.state === "resolved")
    .map((entry) => entry.fieldId);

  return {
    kind: "explicit",
    fieldIds: [...new Set([...fieldSelection.fieldIds, ...mappedFieldIds])],
  };
}

/** Runs tasks a few at a time, so a large fan-out does not overwhelm the instance. */
async function runWithConcurrency<TItem>(
  items: readonly TItem[],
  concurrency: number,
  run: (item: TItem) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) await run(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Fetches change history one issue at a time.
 *
 * Only reached when the instance's probe says a search does not return history —
 * a Cloud behaviour rather than a Data Center one. Partial completion is
 * reported as partial; it does not fail the retrieval, and it never lets an
 * issue whose history is missing be counted as though it had none.
 */
async function fillMissingChangelogs(
  rawIssues: Record<string, unknown>[],
  adapter: JiraAdapter,
): Promise<ChangelogCoverage> {
  const needingHistory = rawIssues.filter((issue) => issue.changelog === undefined);
  if (needingHistory.length === 0) return "full";

  let retrievedCount = 0;
  await runWithConcurrency(needingHistory, CHANGELOG_FETCH_CONCURRENCY, async (issue) => {
    const key = String(issue.key ?? "");
    if (key.length === 0) return;
    const response = await adapter.fetchIssueDetail(key, { doesIncludeChangelog: true });
    if (response.statusCode === 200 && response.body?.changelog !== undefined) {
      issue.changelog = response.body.changelog;
      retrievedCount += 1;
    }
  });

  if (retrievedCount === 0) return "none";
  return retrievedCount === needingHistory.length ? "full" : "partial";
}

/**
 * Resolves a JQL query into a frozen, provenance-stamped snapshot.
 *
 * Everything downstream is a pure function of what this returns.
 */
export async function fetchIssueSet(
  input: FetchIssueSetInput,
  adapter: JiraAdapter,
): Promise<IssueSet> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const fieldSelection = resolveRequestedFields(input.fieldSelection, input.configuration.fieldMap);
  const fingerprint = computeFingerprint(input.configuration);

  let fieldDisplayNames: Record<string, string> = {};
  let observedFailure: RetrievalFailure | null = null;

  const paged = await fetchIssuesPaged(
    async (startAt, pageSize) => {
      const response = await adapter.searchIssuesByJql({
        jql: input.jql,
        fields: fieldSelection,
        doesIncludeChangelog: input.doesRequireChangelog,
        startAt,
        maxResults: pageSize,
      });

      const failure = classifyFailure(response);
      if (failure !== null) {
        observedFailure = failure;
        return { issues: [], total: 0, failure };
      }

      const page = response.body;
      fieldDisplayNames = { ...fieldDisplayNames, ...(page?.names ?? {}) };
      input.onProgress?.(startAt + (page?.issues.length ?? 0), page?.total ?? 0);

      return { issues: page?.issues ?? [], total: page?.total ?? 0, failure: null };
    },
    { pageSize: input.configuration.retrievalCeiling, ceiling: input.configuration.retrievalCeiling },
  );

  const failure = paged.failure ?? observedFailure;

  // Nothing may be computed over the wreckage of a query that did not run.
  if (failure !== null) {
    const record = buildRetrievalRecord({
      jql: input.jql,
      fieldsRequested: fieldSelection.kind === "all" ? ["*all"] : fieldSelection.fieldIds,
      expandRequested: input.doesRequireChangelog ? ["names", "changelog"] : ["names"],
      startedAtIso,
      durationMs: Date.now() - startedAt,
      totalMatchingCount: 0,
      fetchedCount: 0,
      ceiling: input.configuration.retrievalCeiling,
      changelogCoverage: "none",
      workspaceFingerprint: fingerprint,
      failure,
    });
    return buildIssueSet(record, []);
  }

  const rawIssues = paged.issues.map((issue) => ({ ...issue }));
  const changelogCoverage: ChangelogCoverage = input.doesRequireChangelog
    ? await fillMissingChangelogs(rawIssues, adapter)
    : "none";

  const issues: DetailedIssue[] = rawIssues.map((issue) =>
    normaliseRawIssue(issue, fieldDisplayNames),
  );

  const record = buildRetrievalRecord({
    jql: input.jql,
    fieldsRequested: fieldSelection.kind === "all" ? ["*all"] : fieldSelection.fieldIds,
    expandRequested: input.doesRequireChangelog ? ["names", "changelog"] : ["names"],
    startedAtIso,
    durationMs: Date.now() - startedAt,
    totalMatchingCount: paged.totalMatchingCount,
    fetchedCount: issues.length,
    ceiling: input.configuration.retrievalCeiling,
    changelogCoverage,
    workspaceFingerprint: fingerprint,
    failure: null,
  });

  return buildIssueSet(record, issues);
}
