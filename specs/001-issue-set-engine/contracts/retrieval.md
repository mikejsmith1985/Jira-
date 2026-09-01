# Contract: Retrieval

**Modules**: `packages/core/src/jira/searchIssuesByJql.ts`, `fetchIssueSet.ts`, `fetchIssuesPaged.ts`,
`jiraAdapter.ts`, `dataCenterAdapter.ts`
**Satisfies**: FR-001 – FR-008

This is the **only** path to Jira data. Every other module in the product consumes an `IssueSet` and
never issues a query (FR-008). That single restriction is what makes the "empty result renders as a
green score" defect impossible: there is no second query left to go wrong.

---

## 1. The adapter boundary

```ts
interface JiraAdapter {
  searchIssuesByJql(request: JqlSearchRequest): Promise<JiraSearchPage>;
  fetchIssueDetail(key: string, options: { doesIncludeChangelog: boolean }): Promise<RawIssue>;
  fetchFieldCatalogue(): Promise<JiraFieldDescriptor[]>;
  fetchTransitions(key: string): Promise<TransitionDescriptor[]>;
  probeCapabilities(): Promise<CapabilityProbe>;
}
```

`dataCenterAdapter` is the only implementation in this feature. Three known Cloud differences live
behind this boundary and nowhere else: offset versus token pagination, `Bearer` versus Basic auth, and
whether a paginated per-issue changelog endpoint exists.

### `probeCapabilities`

Run once at setup, and its answers stored. Replaces four items that documentation could not confirm
with evidence from the actual instance.

```ts
interface CapabilityProbe {
  jiraVersion: string;
  doesSearchReturnChangelog: boolean;
  observedMaxResultsCap: number;      // request 250, observe what comes back
  canReadFieldCatalogue: boolean;
  probedAtIso: string;
}
```

**Everything downstream reads the probe, never a documentation assumption.** If
`doesSearchReturnChangelog` is false, `fetchIssueSet` takes the per-issue path automatically and says
so in the retrieval record.

---

## 2. `searchIssuesByJql`

```ts
async function searchIssuesByJql(
  request: {
    jql: string;
    fields: FieldSelection;              // explicit list, or the deliberate 'all'
    doesIncludeChangelog: boolean;
    startAt: number;
    maxResults: number;
  },
  adapter: JiraAdapter,
): Promise<JiraSearchPage>;

type FieldSelection =
  | { kind: 'explicit'; fieldIds: readonly string[] }
  | { kind: 'all' };                     // user-visible toggle, never the default
```

**Requirements**

| # | Rule |
|---|---|
| RQ-1 | `expand` always includes `names`. The UI must be able to show Jira's own label for any field it read. |
| RQ-2 | `expand` includes `changelog` only when `doesIncludeChangelog` is true. Uncapped changelogs are the documented memory risk; a query that does not need history must not pay for it. |
| RQ-3 | Omitting `fields` is **forbidden**. Jira silently defaults search to navigable fields only, which quietly hides custom fields from a response that looks complete. |
| RQ-4 | A non-2xx response maps to a typed `RetrievalFailure`, preserving Jira's own `errorMessages` verbatim. Never a thrown string, never a swallowed empty page. |
| RQ-5 | A 429 maps to `transport` failure carrying `Retry-After`. It is never treated as an empty page. |

---

## 3. `fetchIssuesPaged` — where the silent clamp is defeated

Lifted from the predecessor, which already reports truncation honestly, and hardened against the
clamp.

```ts
async function fetchIssuesPaged(
  fetchPage: (startAt: number, pageSize: number) => Promise<JiraSearchPage>,
  options: { pageSize: number; ceiling: number },
): Promise<PagedResult>;
```

**The load-bearing rule**

> **A page shorter than requested does NOT mean the results are exhausted.**

`jira.search.views.default.max` defaults to 1000 on Data Center, and a larger request is **silently
clamped rather than rejected**. Paging therefore continues while
`retrieved.length < total && retrieved.length < ceiling`, using Jira's own `total` as the authority —
never the length of the last page.

| Stop condition | Resulting state |
|---|---|
| `retrieved.length >= total` | `complete` |
| `retrieved.length >= ceiling` and `total > retrieved.length` | `truncated` |
| A page returns zero rows while `total` says more remain | `failed`, kind `transport` — reported, never silently accepted as the end |
| Any page fails | `failed`, carrying that page's failure |

The last row matters: without it, a throttled or failing page in the middle of a retrieval is
indistinguishable from a finished one. That is the same shape of bug as the green zero, one layer
down.

`isTruncated` is **derived** — `total > fetchedCount` — and never assigned by a caller. Reaching the
ceiling exactly at the true total is not truncation and must not be reported as such.

---

## 4. `fetchIssueSet`

```ts
async function fetchIssueSet(
  input: {
    jql: string;
    fieldMap: FieldMap;
    ceiling: number;
    doesRequireChangelog: boolean;
    fieldSelection: FieldSelection;
  },
  adapter: JiraAdapter,
  configuration: WorkspaceConfiguration,
): Promise<IssueSet>;
```

**Behaviour**

1. Field ids to request = the explicit selection ∪ every `resolved` entry in the field map. A concept
   the user has mapped is always retrieved, whether or not the caller thought to ask.
2. If `doesRequireChangelog` and the probe says search omits changelog: fan out to per-issue detail at
   a concurrency of 6, streaming progress. Partial completion sets
   `changelogCoverage: 'partial'` — it does not fail the retrieval.
3. Construct the `RetrievalRecord`, stamping the current `workspaceFingerprint`.
4. Freeze. An `IssueSet` is never mutated after construction.

**Post-conditions, enforced by test**

- `record.failure !== null` ⟹ `issues.length === 0` and `state === 'failed'`.
- `state === 'complete'` ⟹ `fetchedCount === totalMatchingCount`.
- `byKey.size === issues.length` — no duplicate keys survive.
- `changelogCoverage === 'full'` ⟹ every issue has a non-null `changelog`.

---

## 5. Provenance is not optional

Every `IssueSet` carries a complete `RetrievalRecord` (see [data-model.md](../data-model.md) §2).
There is no constructor that produces one without it, so FR-003 holds structurally rather than by
diligence.

`record.jql` is the **exact string sent**, byte for byte — not a re-rendered or normalised version.
The user copies it and runs it in Jira; if the two differ in any way, the tool's central promise is
broken.

---

## 6. Failure is a value, not an exception

```ts
type RetrievalFailure =
  | { kind: 'jql-error';      jiraMessages: readonly string[] }
  | { kind: 'authentication' }
  | { kind: 'permission';     projectKeys: readonly string[] }
  | { kind: 'transport';      message: string; retryAfterSeconds?: number };
```

Four kinds because each demands a different response from the user (FR-007). A permission failure
displayed as an empty backlog is the specific mistake this union exists to prevent.

**No retrieval failure is ever thrown past this layer.** It travels as data, into `RetrievalRecord`,
into `MeasureProvenance`, and onto the screen — carrying Jira's own words, because Jira's message
("Field 'foo' does not exist or you do not have permission to view it") is more useful than anything
this tool could paraphrase.
