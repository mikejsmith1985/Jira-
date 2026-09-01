// jqlValue.ts — Putting a value safely inside a JQL string.
//
// Small, and worth its own module for one reason: the predecessor had two copies
// of this logic and one of them was subtly wrong. A value containing a quote
// escapes its own literal and changes the query, which produces a result set
// nobody asked for — and, in a tool whose whole claim is that its numbers are
// checkable, a query that is not the query the user thinks it is is the worst
// kind of defect.

/** Characters that must be escaped inside a double-quoted JQL literal. */
const ESCAPE_PATTERN = /(["\\])/g;

/**
 * Escapes a value for use inside a double-quoted JQL literal.
 *
 * Backslashes are escaped before quotes, so an already-escaped quote is not
 * double-escaped into something Jira reads differently.
 *
 * @example
 *   `summary ~ "${escapeJqlValue(userText)}"`
 */
export function escapeJqlValue(value: string): string {
  return value.replace(ESCAPE_PATTERN, "\\$1");
}

/** Renders a list of issue keys as a JQL `in (...)` clause, or null when empty. */
export function buildIssueKeyClause(issueKeys: readonly string[]): string | null {
  if (issueKeys.length === 0) return null;
  const quoted = issueKeys.map((key) => `"${escapeJqlValue(key)}"`).join(", ");
  return `key in (${quoted})`;
}

/**
 * Combines a scope query with an extra condition.
 *
 * The scope is parenthesised so its own `OR` cannot swallow the condition —
 * the difference between "these issues, that are also failing" and "these
 * issues, or anything failing anywhere".
 */
export function combineJql(scopeJql: string, condition: string): string {
  const trimmedScope = scopeJql.trim();
  if (trimmedScope.length === 0) return condition;
  return `(${trimmedScope}) AND ${condition}`;
}
