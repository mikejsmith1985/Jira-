// jiraUrls.ts — Links into Jira that actually work.
//
// The predecessor generated a drill-through link from the REST field name where
// JQL needed the alias, so a correct count sat beside a link that returned an
// error. To a user that reads as the number being wrong, which is worse than the
// link simply being absent.
//
// So links are built here, from a base URL and a query the tool has already
// established is valid, and nowhere else.

/** Where Jira's issue navigator lives. */
const SEARCH_PATH = "/issues/";

/** Where a single issue lives. */
const BROWSE_PATH = "/browse/";

/** Removes a trailing slash so joining never doubles it. */
function normaliseBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * A link that opens exactly these issues in Jira's navigator.
 *
 * The JQL is the same string the tool used, so what opens is what was counted.
 */
export function buildJiraSearchUrl(baseUrl: string, jql: string): string {
  return `${normaliseBaseUrl(baseUrl)}${SEARCH_PATH}?jql=${encodeURIComponent(jql)}`;
}

/** A link to one issue. */
export function buildJiraBrowseUrl(baseUrl: string, issueKey: string): string {
  return `${normaliseBaseUrl(baseUrl)}${BROWSE_PATH}${encodeURIComponent(issueKey)}`;
}
