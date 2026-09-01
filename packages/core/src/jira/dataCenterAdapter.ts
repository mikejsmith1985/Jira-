// dataCenterAdapter.ts — Jira Data Center, spoken correctly.
//
// Every deployment-specific decision lives here, and each one comes from a
// checked finding rather than a habit:
//
//  - `/rest/api/2/search` with offset paging. Cloud retired its equivalent in
//    2025 for a token-paged endpoint; Data Center did not follow, and its
//    "Search API deprecations" guide concerns internal Java APIs, not this.
//  - `fields` is always sent. Omitting it makes Jira return navigable fields
//    only, so a custom field can be missing from a response that looks whole.
//  - `expand=names` is always sent, so a surface can prove which field it read.
//  - `changelog` is sent only when history is needed. Data Center returns it
//    complete and uncapped — better than Cloud, which truncates at 100 — but
//    Atlassian's own note is that it "may cause OOM easily", so a query that
//    does not need history does not pay for it.

import type {
  CapabilityProbe,
  FieldSelection,
  JiraAdapter,
  JiraFieldDescriptor,
  JiraResponse,
  JiraSearchPage,
  JiraTransport,
  JqlSearchRequest,
  TransitionDescriptor,
} from "./jiraAdapter.js";

/** The search endpoint, current on Data Center 9.x through 11.x. */
const SEARCH_PATH = "/rest/api/2/search";

/** Page size the probe asks for, above the common configured cap of 1,000. */
const PROBE_REQUESTED_PAGE_SIZE = 1_500;

/** Builds the `fields` parameter. There is no branch that omits it. */
function renderFieldSelection(fields: FieldSelection): string {
  return fields.kind === "all" ? "*all" : fields.fieldIds.join(",");
}

/** Builds the `expand` parameter, always including names. */
function renderExpand(doesIncludeChangelog: boolean): string {
  return doesIncludeChangelog ? "names,changelog" : "names";
}

/** Assembles a search URL with every parameter encoded. */
function buildSearchPath(request: JqlSearchRequest): string {
  const parameters = new URLSearchParams({
    jql: request.jql,
    fields: renderFieldSelection(request.fields),
    expand: renderExpand(request.doesIncludeChangelog),
    startAt: String(request.startAt),
    maxResults: String(request.maxResults),
  });
  return `${SEARCH_PATH}?${parameters.toString()}`;
}

/** Reads a nested property without throwing when a level is absent. */
function readNested(source: unknown, ...pathSegments: readonly string[]): unknown {
  let current: unknown = source;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Converts one raw field-catalogue entry, keeping the JQL aliases. */
function normaliseFieldDescriptor(raw: Record<string, unknown>): JiraFieldDescriptor {
  const rawClauseNames = raw.clauseNames;
  return {
    fieldId: String(raw.id ?? ""),
    jiraName: String(raw.name ?? ""),
    schemaType: String(readNested(raw, "schema", "type") ?? "unknown"),
    isCustom: raw.custom === true,
    clauseNames: Array.isArray(rawClauseNames) ? rawClauseNames.map(String) : [],
  };
}

/** Converts one raw transition, including any fields its screen demands. */
function normaliseTransition(raw: Record<string, unknown>): TransitionDescriptor {
  const rawFields = readNested(raw, "fields");
  const requiredFieldIds =
    rawFields !== null && typeof rawFields === "object"
      ? Object.entries(rawFields as Record<string, Record<string, unknown>>)
          .filter(([, definition]) => definition.required === true)
          .map(([fieldId]) => fieldId)
      : [];

  return {
    transitionId: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    toStatusName: String(readNested(raw, "to", "name") ?? ""),
    requiredFieldIds,
  };
}

/**
 * Creates the Data Center adapter.
 *
 * The transport holds the credential and constructs no paths of its own, so
 * this module is fully testable with no network and no secret.
 */
export function createDataCenterAdapter(transport: JiraTransport): JiraAdapter {
  async function searchIssuesByJql(
    request: JqlSearchRequest,
  ): Promise<JiraResponse<JiraSearchPage>> {
    return transport.get<JiraSearchPage>(buildSearchPath(request));
  }

  async function fetchIssueDetail(
    issueKey: string,
    options: { doesIncludeChangelog: boolean },
  ): Promise<JiraResponse<Record<string, unknown>>> {
    const expand = renderExpand(options.doesIncludeChangelog);
    return transport.get<Record<string, unknown>>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}?expand=${encodeURIComponent(expand)}`,
    );
  }

  async function fetchFieldCatalogue(): Promise<JiraResponse<readonly JiraFieldDescriptor[]>> {
    const response = await transport.get<readonly Record<string, unknown>[]>("/rest/api/2/field");
    return {
      ...response,
      body: Array.isArray(response.body) ? response.body.map(normaliseFieldDescriptor) : null,
    };
  }

  async function fetchTransitions(
    issueKey: string,
  ): Promise<JiraResponse<readonly TransitionDescriptor[]>> {
    const response = await transport.get<{ transitions?: readonly Record<string, unknown>[] }>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}/transitions?expand=transitions.fields`,
    );
    const rawTransitions = response.body?.transitions;
    return {
      ...response,
      body: Array.isArray(rawTransitions) ? rawTransitions.map(normaliseTransition) : null,
    };
  }

  /**
   * Asks the instance the four things documentation could not settle.
   *
   * Anything it cannot establish is named in `unresolved` rather than assumed,
   * because a confident wrong answer about the instance is the exact failure
   * this product exists to remove.
   */
  async function probeCapabilities(): Promise<CapabilityProbe> {
    const unresolved: string[] = [];

    const serverInfo = await transport.get<{ version?: string }>("/rest/api/2/serverInfo");
    if (serverInfo.statusCode !== 200) unresolved.push("Jira version could not be read.");

    const currentUser = await transport.get<{ name?: string; displayName?: string }>(
      "/rest/api/2/myself",
    );
    if (currentUser.statusCode !== 200) unresolved.push("The credential could not be verified.");

    const catalogue = await transport.get<readonly unknown[]>("/rest/api/2/field");
    const canReadFieldCatalogue = catalogue.statusCode === 200 && Array.isArray(catalogue.body);
    if (!canReadFieldCatalogue) {
      unresolved.push("The field catalogue could not be read, so no concept can be mapped.");
    }

    // One request settles both remaining questions: whether history arrives with
    // a search, and what page size this instance really honours.
    const probeSearch = await searchIssuesByJql({
      jql: "order by created DESC",
      fields: { kind: "explicit", fieldIds: ["summary"] },
      doesIncludeChangelog: true,
      startAt: 0,
      maxResults: PROBE_REQUESTED_PAGE_SIZE,
    });

    const firstIssue = probeSearch.body?.issues?.[0];
    const doesSearchReturnChangelog =
      firstIssue !== undefined && readNested(firstIssue, "changelog", "histories") !== undefined;

    if (probeSearch.statusCode !== 200) {
      unresolved.push("A probe search failed, so paging behaviour is unknown.");
    } else if (firstIssue === undefined) {
      unresolved.push("No issue was visible, so changelog availability is unknown.");
    }

    return {
      jiraVersion: String(serverInfo.body?.version ?? "unknown"),
      currentUserName: String(currentUser.body?.name ?? currentUser.body?.displayName ?? "unknown"),
      doesSearchReturnChangelog,
      observedMaxResultsCap: probeSearch.body?.maxResults ?? PROBE_REQUESTED_PAGE_SIZE,
      canReadFieldCatalogue,
      probedAtIso: new Date().toISOString(),
      unresolved,
    };
  }

  return {
    searchIssuesByJql,
    fetchIssueDetail,
    fetchFieldCatalogue,
    fetchTransitions,
    probeCapabilities,
  };
}

export { SEARCH_PATH, buildSearchPath };
