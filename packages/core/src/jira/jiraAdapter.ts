// jiraAdapter.ts — The one boundary Jira's deployment differences live behind.
//
// Three differences between Data Center and Cloud are real and already shipped:
// offset versus token pagination, Bearer versus Basic authentication, and
// whether a paginated per-issue changelog endpoint exists at all. Every one of
// them is absorbed here, so nothing above this line speaks a URL.
//
// The capability probe matters more than the interface does. Four things about
// a Jira instance could not be confirmed from Atlassian's own documentation, and
// guessing at them would be exactly the behaviour this product exists to stop.
// So the probe asks the instance and records what it said. Evidence, not
// inference.

/** One page of search results, exactly as Jira reports them. */
export interface JiraSearchPage {
  readonly startAt: number;
  readonly maxResults: number;
  readonly total: number;
  readonly issues: readonly Record<string, unknown>[];
  /** From `expand=names`: Jira's own label for every field id in the response. */
  readonly names: Readonly<Record<string, string>>;
}

/** Which fields to request. Omitting the choice is not an option. */
export type FieldSelection =
  | { readonly kind: "explicit"; readonly fieldIds: readonly string[] }
  /** A deliberate, user-visible toggle. Never the default: it is slow and large. */
  | { readonly kind: "all" };

/** One search request, fully specified. */
export interface JqlSearchRequest {
  readonly jql: string;
  readonly fields: FieldSelection;
  readonly doesIncludeChangelog: boolean;
  readonly startAt: number;
  readonly maxResults: number;
}

/** A field as Jira's catalogue describes it. */
export interface JiraFieldDescriptor {
  readonly fieldId: string;
  readonly jiraName: string;
  readonly schemaType: string;
  readonly isCustom: boolean;
  /**
   * The JQL-safe aliases, such as `cf[10236]`.
   *
   * The predecessor built drill-through links from the REST field id, which JQL
   * rejects — producing a correct count sitting beside a link that returned an
   * error, which reads to a user as the number being wrong.
   */
  readonly clauseNames: readonly string[];
}

/** One board in the picker. */
export interface BoardSummary {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
}

/** A transition Jira will accept from an issue's current status. */
export interface TransitionDescriptor {
  readonly transitionId: string;
  readonly name: string;
  readonly toStatusName: string;
  readonly requiredFieldIds: readonly string[];
}

/** What one instance actually does, asked rather than assumed. */
export interface CapabilityProbe {
  readonly jiraVersion: string;
  readonly currentUserName: string;
  /** Whether a search returns change history, deciding one request or three hundred. */
  readonly doesSearchReturnChangelog: boolean;
  /** The page size the instance really honours; it clamps silently above its own cap. */
  readonly observedMaxResultsCap: number;
  readonly canReadFieldCatalogue: boolean;
  readonly probedAtIso: string;
  /** Anything the probe could not establish, named rather than guessed at. */
  readonly unresolved: readonly string[];
}

/** One issue type a project offers. Defined here so the adapter can name it. */
export interface IssueTypeChoice {
  readonly issueTypeId: string;
  readonly name: string;
  readonly isSubtask: boolean;
}

/** What a response looked like, whether or not it succeeded. */
export interface JiraResponse<TBody> {
  readonly statusCode: number;
  readonly body: TBody | null;
  /** Jira's own `errorMessages`, preserved word for word. */
  readonly jiraMessages: readonly string[];
  readonly retryAfterSeconds: number | null;
  /**
   * Set by Jira+'s own proxy when IT refused, rather than Jira.
   *
   * Jira cannot set this, which is what keeps a local refusal separable from
   * a genuine outage that happens to share a status code.
   */
  readonly jiraPlusFailureKind?: string | null;
  /**
   * What Jira+ sent and what came back, when Jira refused.
   *
   * A status code alone cannot be diagnosed: the two halves that explain it are
   * the request and the reply, and both used to be discarded. Present only on a
   * refusal — a reply that worked is left exactly as Jira sent it.
   */
  readonly failureDiagnosis?: FailureDiagnosis | null;
}

/** The two halves of a refusal, kept so somebody can read it. */
export interface FailureDiagnosis {
  readonly sentMethod: string;
  readonly sentPath: string;
  /** Which door it went through: the relaying tab, or a configured token. */
  readonly sentVia: string;
  readonly sentBody: unknown;
  readonly rawReply: string;
}

/** The transport, so the engine never constructs a URL or holds a credential. */
export interface JiraTransport {
  get<TBody>(pathAndQuery: string): Promise<JiraResponse<TBody>>;
  post<TBody>(pathAndQuery: string, body: unknown): Promise<JiraResponse<TBody>>;
  put(pathAndQuery: string, body: unknown): Promise<JiraResponse<void>>;
}

/** Everything the engine asks of a Jira deployment. */
export interface JiraAdapter {
  searchIssuesByJql(request: JqlSearchRequest): Promise<JiraResponse<JiraSearchPage>>;
  fetchIssueDetail(
    issueKey: string,
    options: { doesIncludeChangelog: boolean },
  ): Promise<JiraResponse<Record<string, unknown>>>;
  fetchFieldCatalogue(): Promise<JiraResponse<readonly JiraFieldDescriptor[]>>;
  /** The issue types a project offers, from the instance rather than a list. */
  fetchIssueTypesForProject(
    projectKey: string,
  ): Promise<JiraResponse<readonly IssueTypeChoice[]>>;
  /**
   * Creates one issue and returns its key.
   *
   * The only route in this product that brings an issue into existence, so the
   * one place a duplicate could ever originate.
   */
  createIssue(
    body: Readonly<Record<string, unknown>>,
  ): Promise<JiraResponse<{ readonly key: string }>>;
  /** What one issue type's create screen offers, keyed by the instance's field id. */
  fetchCreateScreenFields(
    projectKey: string,
    issueTypeId: string,
  ): Promise<JiraResponse<Readonly<Record<string, unknown>>>>;
  fetchTransitions(issueKey: string): Promise<JiraResponse<readonly TransitionDescriptor[]>>;
  probeCapabilities(): Promise<CapabilityProbe>;

  /**
   * A board's own columns and their status mappings.
   *
   * Nothing in the predecessor ever called this, which is why its roll-up board
   * maintained a parallel vocabulary reconciled against nothing.
   */
  fetchBoardConfiguration(boardId: number): Promise<JiraResponse<BoardConfigurationResponse>>;

  /** Boards this user can see for a project, for the picker. */
  fetchBoardsForProject(projectKey: string): Promise<JiraResponse<readonly BoardSummary[]>>;

  /** Every issue the board's own filter selects. */
  fetchBoardIssues(
    boardId: number,
    request: { fields: FieldSelection; startAt: number; maxResults: number },
  ): Promise<JiraResponse<JiraSearchPage>>;

  /** Applies a workflow transition, optionally setting fields on its screen. */
  applyTransition(
    issueKey: string,
    transitionId: string,
    fields?: Record<string, unknown>,
  ): Promise<JiraResponse<void>>;
}

/** One board in the picker. */
export interface BoardSummary {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
}

/** One board's raw configuration, as Jira returns it. */
export interface BoardConfigurationResponse {
  readonly id?: number;
  readonly name?: string;
  readonly type?: string;
  readonly columnConfig?: {
    readonly columns?: readonly Record<string, unknown>[];
  };
}
