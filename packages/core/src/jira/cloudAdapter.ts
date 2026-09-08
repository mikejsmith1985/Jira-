// cloudAdapter.ts — The Cloud seam, deliberately unimplemented.
//
// This file exists so that supporting Jira Cloud is a file to write rather than
// a refactor to survive. Every difference it would have to absorb is already
// known and already isolated behind `JiraAdapter`:
//
//   1. Cloud retired `/rest/api/2|3/search` in 2025. It now answers 410 Gone,
//      and the replacement `/rest/api/3/search/jql` pages by continuation token
//      rather than by offset — so the paging contract changes shape, not just
//      its parameter names.
//   2. Cloud authenticates with an account email and API token over HTTP Basic,
//      not the `Bearer` personal access token Data Center uses.
//   3. Cloud truncates change history in search results at 100 entries and
//      offers a paginated `/issue/{key}/changelog` endpoint to recover the rest.
//      Data Center returns history complete and has no such endpoint. A flow
//      engine written against Data Center's behaviour would silently lose
//      history on Cloud, which is precisely the class of quiet wrongness this
//      product exists to eliminate.
//   4. Descriptions arrive as Atlassian Document Format rather than wiki markup.
//
// It throws rather than half-working. A partial Cloud adapter would produce
// numbers that look right and are not, and there is no state of this product in
// which that is preferable to an honest refusal.

import type { JiraAdapter, JiraTransport } from "./jiraAdapter.js";

/** What a caller is told, so the message names the work rather than the absence. */
const NOT_IMPLEMENTED_MESSAGE =
  "Jira Cloud is not supported yet. Cloud differs from Data Center in four ways that would " +
  "change results rather than merely change requests — token pagination on a different search " +
  "endpoint, Basic authentication, change history capped at 100 entries per issue, and " +
  "document-format descriptions. Jira+ refuses rather than reporting numbers it cannot stand " +
  "behind.";

/**
 * Creates the Cloud adapter.
 *
 * Every method throws. The shape is real so that TypeScript proves, today, that
 * the rest of the engine speaks only to the adapter interface and never to a
 * URL — which is the property that makes Cloud support additive later.
 */
export function createCloudAdapter(_transport: JiraTransport): JiraAdapter {
  const refuse = (): never => {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  };

  return {
    searchIssuesByJql: refuse,
    fetchIssueDetail: refuse,
    fetchFieldCatalogue: refuse,
    fetchIssueTypesForProject: refuse,
    fetchCreateScreenFields: refuse,
    createIssue: refuse,
    fetchTransitions: refuse,
    probeCapabilities: refuse,
    fetchBoardConfiguration: refuse,
    fetchBoardsForProject: refuse,
    fetchBoardIssues: refuse,
    applyTransition: refuse,
  };
}

export { NOT_IMPLEMENTED_MESSAGE };
