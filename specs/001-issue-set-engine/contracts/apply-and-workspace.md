# Contract: Applying Changes, and the Workspace

**Modules**: `packages/core/src/apply/buildChangeSet.ts`, `runApplyPlan.ts`, `jira/write/fieldWriters.ts`,
`resolveFieldWriteRoute.ts`, `workspace/workspaceConfig.ts`, `fingerprint.ts`;
`server/routes/{jiraProxy,workspace}.js`, `server/services/writeJournal.js`
**Satisfies**: FR-028 – FR-031, FR-042 – FR-047, FR-056 – FR-059

---

# Part A — Writing to Jira

## A1. Build the change set purely

```ts
function buildChangeSet(input: {
  proposals: readonly Proposal[];
  issueSet: IssueSet;
  fieldMap: FieldMap;
}): ChangeSet;

interface ChangeSet {
  plannedChanges: readonly PlannedChange[];
  blockers: readonly ChangeBlocker[];
}

interface PlannedChange {
  issueKey: string;
  fieldId: string;
  fieldLabel: string;          // Jira's own name, from expand=names
  currentValue: unknown;
  proposedValue: unknown;
  writeRoute: WriteRoute;
}
```

**Pure — it reaches nothing.** Given the same proposals and the same issue set it returns the same
plan, so the plan is fully unit-testable with no Jira and no mocking of one.

| # | Rule | Requirement |
|---|---|---|
| W-1 | A proposed value equal to the current value produces **no** planned change | FR-043 |
| W-2 | Equality is compared after normalising the value's own shape — rich text compared as text, option compared by id | Prevents a formatting difference reading as an edit |
| W-3 | A proposal for a concept whose field is not `resolved` becomes a **blocker**, not a write | FR-020 |
| W-4 | A proposal for an issue absent from the issue set becomes a blocker | Never write to something not retrieved |

```ts
function canApplyChangeSet(set: ChangeSet): boolean;   // blockers.length === 0
```

**One blocker stops everything** (FR-044). Not "apply the valid ones and warn" — the whole action is
refused, with the reasons shown. A partially applied set is unreviewable: the user cannot tell what
happened without going and looking, and going and looking is the thing this tool exists to replace.

## A2. Show the diff before sending

The `was → will be` table (FR-042) renders `fieldLabel`, `currentValue`, `proposedValue`, per issue,
with a checkbox each. Unchecking removes a planned change and rebuilds the set.

**No request is sent before this is displayed and confirmed.** There is no "apply all" that skips it.

## A3. Apply, item by item

```ts
async function runApplyPlan(
  set: ChangeSet,
  writers: FieldWriters,
  adapter: JiraAdapter,
): Promise<ApplyOutcome>;

interface ApplyOutcome {
  results: readonly {
    issueKey: string; fieldId: string;
    status: 'applied' | 'failed';
    message?: string;                 // Jira's own words on failure
  }[];
}
```

**Each result is independent** (FR-045). Five changes where the third fails yields four applied and
one failure carrying its reason — no rollback, no abort, no all-or-nothing.

Rollback is deliberately not attempted: reverting a successful write to make a set look atomic is a
second unrequested change, and it lies about what Jira now holds.

## A4. Writers

Lifted from the predecessor, where they are already shared across unrelated surfaces and already
handle Jira's inconsistencies:

| Route | Handles |
|---|---|
| `simple` | Plain text and number fields |
| `option` | Single-select — `{ id }`, not a bare string |
| `user` | Account identifier, whose shape differs by deployment |
| `fixVersion` | Requires `update.set`, **not** `fields` |
| `storyPoints` | May be a number **or** a dropdown on a given instance |
| `issueLink` | |
| `transition` | With required-field collection when the transition screen demands it |

```ts
function resolveFieldWriteRoute(fieldId: string, fieldMap: FieldMap,
                                catalogue: readonly JiraFieldDescriptor[]): WriteRoute;
```

One router, so a field written from a hygiene fix and the same field written from a pack produce
**byte-identical requests**. Two code paths writing the same field is how two surfaces come to
disagree about what a successful write looks like.

## A5. The change journal

```js
function recordJiraWrite({ method, path, source }): void;
```

Server-side, append-only, local, capped. Records method, endpoint pattern, classification, time and
outcome. **Request bodies are deliberately excluded** — this is attribution, not a second copy of the
data.

Every write passes through the proxy, so the journal cannot be bypassed (FR-046). `GET /api/write-journal`
backs an in-app view answering "what did this tool change?" — which is a trust feature, not an
operations one.

---

# Part B — The workspace

## B1. One record, outside the browser

```ts
interface WorkspaceConfiguration {
  schemaVersion: number;
  fieldMap: Record<ConceptId, FieldMapEntry>;
  enabledCheckIds: readonly string[];
  completionLenses: Record<CompletionLensId, CompletionLens>;
  workingCalendar: WorkingCalendar;
  retrievalCeiling: number;
  transferBudgetCharacters: number;
  updatedAtIso: string;
  updatedBy: string;
}
```

Stored as one JSON document under the user profile directory, served by the local server (FR-028).

**Nothing capable of changing a number touches browser storage.** The predecessor kept its rule
configuration in a single `localStorage` key, so two people ran different checks with different
severities and neither was told. Browser storage here holds open panels, the last query text, and the
theme — items that cannot alter a result (FR-031).

## B2. The fingerprint

```ts
function computeFingerprint(configuration: WorkspaceConfiguration): string;   // 8 chars
```

Hashes only the **semantically significant** fields — field map, enabled checks, lens definitions,
calendar, ceilings. `updatedAtIso` and `updatedBy` are excluded, so re-saving without a real change
does not invalidate a comparison.

Displayed in the header, stamped into every `RetrievalRecord`, printed on every export (FR-029).

**What it actually buys.** Each person runs their own copy, so a shared store is not available. The
fingerprint does not prevent divergence — it makes divergence **visible before anyone argues about a
number**. Two people comparing exports see two different eight-character strings and know immediately
that the disagreement is about configuration, not about reality. That is the achievable win without
asking anyone to provision a server.

## B3. Export and import

```
GET  /api/workspace          → { configuration, fingerprint }
PUT  /api/workspace          → validate, persist, return the new fingerprint
GET  /api/workspace/export   → the file
POST /api/workspace/import   → diff, require confirmation, then REPLACE
```

| # | Rule | Requirement |
|---|---|---|
| K-1 | Import **replaces wholly**, never merges | FR-030 |
| K-2 | Therefore an import always reproduces the exporter's fingerprint exactly | FR-030 |
| K-3 | A differing import shows what changes and requires confirmation | FR-030A |
| K-4 | Results carry the fingerprint that produced them; a result whose fingerprint no longer matches current configuration is marked **stale**, never re-attributed | FR-030B |
| K-5 | A `schemaVersion` older than the application's is reported as needing review, never reinterpreted silently | Edge case |

K-1 is not a convenience. A merge would produce a configuration matching neither party's, with a third
fingerprint, and the mechanism would be worse than useless — it would manufacture the disagreement it
exists to reveal.

## B4. The server

Lifted from the predecessor and stripped to Jira alone — roughly 150 lines.

| Route | Purpose |
|---|---|
| `ALL /jira-proxy/*` | Forward to Jira with the token injected server-side |
| `GET/PUT /api/workspace` | The configuration document |
| `GET /api/write-journal` | The change log |
| `GET /api/health` | Connectivity and the capability probe |
| `GET /*` | The built client |

Deleted from the predecessor: the ServiceNow and GitHub proxies, all nine schedulers, the relay
bridge, notifications, SharePoint, the generated server-side engine bundles, demo mode, and executable
packaging.

**Credential handling** (FR-056 – FR-059):

- One credential: a Jira personal access token, sent as `Authorization: Bearer`.
- Held in a configuration file under the user profile, **never** served to the browser.
- A token acts as its creating user with exactly that user's permissions, so no administrative rights
  are required anywhere — FR-058 holds by construction rather than by policy.
- `sslVerify` is configurable for corporate networks that inspect encrypted traffic (FR-059).
