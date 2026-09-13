// simpleSearch.ts — A search anybody can run, that is still one query.
//
// JQL is a real barrier. Most people who need an answer about their own team's
// issues cannot write it, and telling them to learn it first is how a tool ends
// up used by one person — which is the adoption failure this product exists to
// avoid repeating.
//
// One rule keeps it honest: the builder produces JQL and SHOWS it. It is a way
// to WRITE the query, never a second way to ask Jira. Everything downstream
// still reads one frozen Issue Set, from one query whose exact text is on screen
// and stamped on every result — so a number a beginner produced can be checked,
// re-run and argued with exactly like anybody else's. It also means the builder
// can be wrong out loud, and a query nobody can read is a query nobody can
// correct.

/** Whose issues to ask for. */
export type Assignment = "anyone" | "me" | "unassigned";

/** Whether the work is finished, by Jira's own classification. */
export type Completion = "any" | "open" | "done";

/** What somebody picked on the basic search form. */
export interface SimpleSearchCriteria {
  readonly projectKeys: readonly string[];
  readonly issueTypeNames: readonly string[];
  readonly statusNames: readonly string[];
  readonly assignment: Assignment;
  readonly completion: Completion;
  readonly text: string;
  /** Only issues touched within this many days, or null for no window. */
  readonly updatedWithinDays: number | null;
  readonly orderBy: string;
}

/** The default sort: most recently touched first, which is what people expect. */
const DEFAULT_ORDER_FIELD = "updated";

/** Nothing chosen. */
export function buildEmptyCriteria(): SimpleSearchCriteria {
  return {
    projectKeys: [],
    issueTypeNames: [],
    statusNames: [],
    assignment: "anyone",
    completion: "any",
    text: "",
    updatedWithinDays: null,
    orderBy: DEFAULT_ORDER_FIELD,
  };
}

/**
 * Quotes a value for JQL.
 *
 * Not decoration: `type = Sub-task` is a syntax error and
 * `status = Ready for Testing` is three tokens Jira cannot parse.
 */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * One clause for a field against a set of values.
 *
 * `=` for one and `in` for several, because that is what a person reading the
 * query back expects to see — and reading it back is the point.
 */
function buildSetClause(
  field: string,
  values: readonly string[],
  doesNeedQuotes: boolean,
): string | null {
  if (values.length === 0) return null;
  const rendered = values.map((value) => (doesNeedQuotes ? quote(value) : value));
  if (rendered.length === 1) return `${field} = ${rendered[0]}`;
  return `${field} in (${rendered.join(", ")})`;
}

/** The clause for who the issues belong to. */
function buildAssignmentClause(assignment: Assignment): string | null {
  // currentUser() works with a relaying tab and with a token alike, and needs
  // no account name written down anywhere.
  if (assignment === "me") return "assignee = currentUser()";
  if (assignment === "unassigned") return "assignee is EMPTY";
  return null;
}

/** The clause for finished or unfinished work. */
function buildCompletionClause(completion: Completion): string | null {
  // statusCategory is the one status grouping every Jira instance has, so this
  // works without knowing a single one of this team's status names.
  if (completion === "open") return "statusCategory != Done";
  if (completion === "done") return "statusCategory = Done";
  return null;
}

/**
 * Turns what somebody picked into the query that will actually run.
 *
 * Returns an empty string when nothing was chosen. An empty builder that means
 * "every issue in the instance" is a way to retrieve tens of thousands of issues
 * by touching nothing.
 */
export function buildJqlFromCriteria(criteria: SimpleSearchCriteria): string {
  const trimmedText = criteria.text.trim();

  // A fixed order, so two identical searches produce the identical query text.
  // A query whose words move about cannot be compared, and comparing is what the
  // provenance stamp exists for.
  const clauses = [
    buildSetClause("project", criteria.projectKeys, false),
    buildSetClause("type", criteria.issueTypeNames, true),
    buildSetClause("status", criteria.statusNames, true),
    buildCompletionClause(criteria.completion),
    buildAssignmentClause(criteria.assignment),
    trimmedText.length === 0 ? null : `text ~ ${quote(trimmedText)}`,
    criteria.updatedWithinDays === null ? null : `updated >= -${criteria.updatedWithinDays}d`,
  ].filter((clause): clause is string => clause !== null);

  if (clauses.length === 0) return "";

  const orderField = criteria.orderBy.trim().length === 0 ? DEFAULT_ORDER_FIELD : criteria.orderBy;
  return `${clauses.join(" AND ")} ORDER BY ${orderField} DESC`;
}
