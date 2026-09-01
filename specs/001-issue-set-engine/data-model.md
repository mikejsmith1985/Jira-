# Data Model: Issue Set Engine and Trust Architecture

**Feature**: `001-issue-set-engine` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

All types live in `packages/core`, which compiles for both the browser and Node so that no rule is
ever written twice. Nothing here is a database schema — the only persisted document is the workspace
configuration; everything else is derived in memory from one retrieval.

---

## 1. Reading Jira

### `DetailedIssue`

One Jira issue as retrieved, normalised only where Jira's own shapes are inconsistent.

| Field | Type | Notes |
|---|---|---|
| `key` | `string` | `ENCUC-142`. The identity used everywhere. |
| `id` | `string` | Jira's numeric id, kept for write paths that need it. |
| `issueTypeName` | `string` | Raw name; never mapped to a hardcoded family. |
| `statusName` | `string` | |
| `statusId` | `string` | |
| `statusCategoryKey` | `'new' \| 'indeterminate' \| 'done'` | Jira's own universal vocabulary. |
| `projectKey` | `string` | |
| `createdIso` | `string` | |
| `resolutionDateIso` | `string \| null` | |
| `assigneeAccountId` | `string \| null` | `null` is meaningful: unassigned. |
| `fields` | `ReadonlyMap<string, unknown>` | Raw, keyed by Jira field id. Read only via `readConcept`. |
| `fieldNames` | `ReadonlyMap<string, string>` | From `expand=names`. Lets the UI prove which field was read. |
| `changelog` | `ChangelogEntry[] \| null` | `null` means *not retrieved*, never *no history*. |

**Validation**: `key` non-empty; `changelog` sorted ascending by `atIso`; `fields` never mutated after
construction.

**The `null` rule.** `changelog: null` and `changelog: []` mean different things — unavailable versus
genuinely empty. Collapsing them is how a predecessor turned a missing fetch into a confident zero.

### `ChangelogEntry`

| Field | Type | Notes |
|---|---|---|
| `atIso` | `string` | |
| `authorAccountId` | `string \| null` | |
| `items` | `ChangelogItem[]` | `{ field, fromString, toString, fromId, toId }` |

Only `status` and `assignee` items are consumed by this feature; the rest are retained unparsed.

---

## 2. Provenance — the account of how a number came to exist

### `RetrievalRecord`

Attached to every Issue Set and copied onto every derived result and export.

| Field | Type | Notes |
|---|---|---|
| `issueSetId` | `string` | Stable id, stamped on every derived figure. |
| `jql` | `string` | **Verbatim** — exactly what was sent, copyable by the user. |
| `fieldsRequested` | `readonly string[]` | |
| `expandRequested` | `readonly string[]` | |
| `startedAtIso` | `string` | |
| `durationMs` | `number` | |
| `totalMatchingCount` | `number` | Jira's own total. |
| `fetchedCount` | `number` | |
| `isTruncated` | `boolean` | True only when `totalMatchingCount > fetchedCount`. |
| `ceiling` | `number` | The limit that applied. |
| `changelogCoverage` | `'none' \| 'partial' \| 'full'` | |
| `workspaceFingerprint` | `string` | Eight characters, from the configuration. |
| `failure` | `RetrievalFailure \| null` | Non-null poisons every derived `Measure`. |

**Validation**: `fetchedCount ≤ totalMatchingCount`; `isTruncated` is derived, never assigned;
`failure !== null` implies `fetchedCount === 0`.

### `RetrievalFailure`

A discriminated union, because the four cases demand four different things of the user (FR-007).

| Kind | Carries | The user's next move |
|---|---|---|
| `jql-error` | `jiraMessages: string[]` | Fix the query — Jira's own wording is shown |
| `authentication` | — | Renew the credential |
| `permission` | `projectKeys: string[]` | Request access, or narrow the query |
| `transport` | `message: string` | Retry, or check the network |

### `IssueSet`

```
IssueSet {
  state:      'complete' | 'truncated' | 'failed'
  record:     RetrievalRecord
  issues:     readonly DetailedIssue[]
  byKey:      ReadonlyMap<string, DetailedIssue>
}
```

**Immutable after construction.** Every lens in the product is a pure function of one of these
(FR-008). `state` is derived from `record`, never set independently.

---

## 3. The measurement contract

### `Measure` — the only shape a quantity may take

```
Measure =
  | { state: 'measured';       flaggedKeys: readonly string[]
                               eligibleKeys: readonly string[]
                               isPartial: boolean
                               provenance: MeasureProvenance }
  | { state: 'not-applicable'; reason: string
                               provenance: MeasureProvenance }
  | { state: 'unresolved';     blocker: EvaluabilityBlocker
                               provenance: MeasureProvenance }
```

**There is no `count` field.** A count is `flaggedKeys.length`, and the drill-through renders the same
array — so FR-010's agreement between a number and its links is a property of the shape, not a rule
anyone has to remember.

**Constructor invariants** — `measure()` is the only way to build one, and it refuses otherwise:

1. `eligibleKeys.length === 0` → returns `not-applicable`, never `measured`. This is FR-012, and it is
   why a zero population can never render as a pass.
2. `flaggedKeys ⊆ eligibleKeys`.
3. `eligibleKeys ⊆ issueSet.byKey.keys()`.
4. `record.failure !== null` → returns `unresolved` regardless of what the caller passed.
5. `isPartial` is inherited from `record.isTruncated`, never assigned by the caller.

### `EvaluabilityBlocker`

| Kind | Carries |
|---|---|
| `retrieval-failed` | `failure: RetrievalFailure` |
| `concept-unmapped` | `conceptIds: readonly ConceptId[]` |
| `concept-ambiguous` | `conceptId: ConceptId`, `candidates: JiraFieldDescriptor[]` |
| `history-unavailable` | `affectedCount: number` |
| `lens-undefined` | `lensId: CompletionLensId` |

### `MeasureProvenance`

`{ sourceId, record, workspaceFingerprint, lensId? }` — enough for the user to answer "where did this
number come from?" without leaving the view (FR-015).

---

## 4. Concepts and their mapping

### `ConceptId`

The named information the product needs. A closed set; adding one is a deliberate act.

`storyPoints` · `acceptanceCriteria` · `parentFeature` · `targetStart` · `targetEnd` ·
`programIncrement`

`fixVersion` is deliberately **not** a concept — it is a field Jira always provides, which is what
lets its check stay measurable when mapped concepts are not (FR-021A).

### `FieldMapEntry`

```
FieldMapEntry =
  | { state: 'resolved';  fieldId: string; jiraName: string
                          matchedBy: 'explicit' | 'exact-name'; confirmedAtIso: string }
  | { state: 'ambiguous'; candidates: readonly JiraFieldDescriptor[] }
  | { state: 'unmapped' }
  | { state: 'absent';    confirmedAtIso: string }
```

**State transitions**

```
unmapped ──discovery finds exactly one exact-name match──▶ (still unmapped; a candidate is PROPOSED,
                                                            never auto-committed — FR-024)
unmapped ──user confirms a candidate──────────────────────▶ resolved
unmapped ──discovery finds several────────────────────────▶ ambiguous
ambiguous ──user chooses────────────────────────────────▶ resolved
unmapped ──user records "not on this instance"──────────▶ absent
resolved ──field no longer present in Jira's catalogue──▶ ambiguous  (re-confirmation required)
any ──user clears──────────────────────────────────────▶ unmapped
```

**Why `absent` is not `unmapped`**: `absent` is a confirmed answer and yields `not-applicable` — grey,
excluded from aggregates. `unmapped` is an unanswered question and yields `unresolved` — amber, and
blocking. Neither can ever render as a pass (FR-027, FR-020).

**No default field ids exist anywhere in the product** (FR-023). The predecessor's hardcoded
`customfield_10028` silently bound checks to the wrong field on this very instance.

### `JiraFieldDescriptor`

`{ fieldId, jiraName, schemaType, isCustom, clauseNames, sampleValue? }` — `sampleValue` is read from
an issue the user names, and is what makes confirmation real rather than nominal (FR-025).

---

## 5. Checks

### `CheckDefinition`

One declaration, one file. The catalogue is `Object.values(registry)`, so a check cannot exist without
appearing and cannot appear without being evaluated (FR-017, FR-021C).

| Field | Type | Notes |
|---|---|---|
| `checkId` | `string` | |
| `title` | `string` | |
| `whyItMatters` | `string` | Shown to the user; a finding nobody understands is not acted on. |
| `severity` | `'high' \| 'medium' \| 'low'` | |
| `requiredConcepts` | `readonly ConceptId[]` | Any unmapped → `unresolved` before evaluation runs. |
| `isInPopulation` | `(issue, context) => boolean` | **This is the denominator** (FR-018). |
| `hasFinding` | `(issue, context) => boolean` | Only called for issues in the population. |
| `fixPackId` | `string \| undefined` | |

**Rules enforced by test, not convention**

- No check may reach Jira. It receives already-retrieved issues (FR-008).
- No check may name a `customfield_` id. Fields are read through `context.readConcept` (FR-019).
- Every exported definition is present in the registry, and no `checkId` literal appears outside it.

### The three checks shipped

| `checkId` | Population | Requires | Demonstrates |
|---|---|---|---|
| `missing-story-points` | Estimable delivery types | `storyPoints` | `unresolved` when the concept is unmapped |
| `missing-acceptance-criteria` | Delivery types | `acceptanceCriteria` | Same, plus an AI fix pack |
| `missing-fix-version` | **Every type that can carry a fix version** | none | Stays measurable when the others are not |

`missing-fix-version` carries a specific historical debt: the predecessor gated it to feature-level
issues and reported nothing across seventy-two affected items. Its population test is the regression
test (FR-021B).

---

## 6. Completion lenses

### `CompletionLens`

```
CompletionLens {
  lensId:            'delivered-to-int' | 'released-to-prod'
  label:             string
  completedWhen:     StatusCondition
  startedWhen:       StatusCondition
  verifyingJqlFor:   (periodStart, periodEnd) => string
}
```

`StatusCondition` is either `{ kind: 'category'; category: 'done' }` or
`{ kind: 'named-statuses'; statusNames: readonly string[] }`.

| Lens | Default `completedWhen` | Role |
|---|---|---|
| `released-to-prod` | Jira's `done` category | Reconciles with an untouched Jira report — the number nobody can argue with |
| `delivered-to-int` | Team's named integration-test status | The Definition of Done; the lens PI commitments are judged by |

**Invariants** (FR-049D, SC-006A)

- For any period: `completedUnder('released-to-prod') ⊆ completedUnder('delivered-to-int')`.
- An item completed under one lens but not the other is *in progress* under the stricter lens — never
  absent from either view.
- The reverse containment failing is a **fault**, reported as such, never displayed as a result.
- Lens definitions live in the workspace configuration, so they are inside the fingerprint (FR-049E).

---

## 7. Flow

### `IssueTimeline`

Reconstructed from `changelog`. Lifted from the predecessor's proven `issueTimeline` module.

`{ issueKey, statusSegments: Segment<string>[], holderSegments: Segment<string | UNASSIGNED>[],
originMs, isReconstructable }`

`Segment<T> { value: T; fromMs: number; toMs: number | null }` — an open `toMs` means still current.

**`isReconstructable: false`** when `changelog === null`. Such issues are excluded from every flow
figure and **counted in the exclusion report** (FR-054). They are never treated as zero.

### `HolderCredit`

`{ issueKey, holderId, activeMillis, waitingMillis, shareOfIssue }`

**Invariant, asserted in test and at runtime in development**: for one issue,
`sum(shareOfIssue) === 1.0 ± 1e-9`.

This is the fix for the predecessor's defect where one issue touched by four people credited its full
points to each, so per-person columns did not sum to the team total. Team figures count distinct
issues (FR-051); per-person figures divide one issue's time (FR-052).

`UNASSIGNED` is an explicit holder, never charged to whoever picked the issue up next (FR-053).

---

## 8. Configuration

### `WorkspaceConfiguration`

One record per installation, outside the browser (FR-028).

| Field | Notes |
|---|---|
| `schemaVersion` | Detects a record predating a rules change |
| `fieldMap` | `Record<ConceptId, FieldMapEntry>` |
| `enabledCheckIds` | Not a personal preference (FR-021) |
| `completionLenses` | Both lens definitions |
| `workingCalendar` | `{ weekendDays, holidayIsoDates }` |
| `retrievalCeiling` | Default and maximum issues per retrieval |
| `transferBudgetCharacters` | Default below Copilot's ~18,000 limit |
| `updatedAtIso`, `updatedBy` | |

`computeFingerprint()` hashes only the **semantically significant** fields — those capable of changing
a number. `updatedAtIso` and `updatedBy` are excluded, so re-saving without a real change does not
invalidate a comparison.

**Import replaces wholly, never merges** (FR-030), so an import always reproduces the exporter's
fingerprint exactly. A differing import is diffed and confirmed before replacing (FR-030A).

Browser storage holds only what cannot change a number: open panels, last query text, theme (FR-031).

---

## 9. The assistant round trip

### `PromptPack`

```
PromptPack {
  packId:          string          // also the reply's guard
  title, purpose:  string
  isEligibleIssue: (issue, context) => boolean
  promptConcepts:  readonly ConceptId[]
  instruction:     string
  itemSchema:      PackItemSchema  // ← declared ONCE
  toProposals:     (item, issue) => Proposal[]
}
```

**`itemSchema` generates both the prompt's required-shape section and the reply validator.** They
cannot drift, because there is one declaration. This is what collapses the predecessor's sixteen
hand-written prompt/parser pairs into one runtime (FR-033).

### `PromptChunk`

`{ index, total, text, issueKeyWhitelist, characterCount, state: 'pending' | 'copied' | 'returned' }`

Division happens on issue boundaries only (FR-035). With an ~18,000-character box and full issue
content, multi-part is the normal case — which is why `state` is load-bearing: it is the only thing
stopping a half-returned run from reading as complete.

An issue whose own detail exceeds the budget is reported `untransferable` and skipped, never split
(FR-035A).

### `PackReplyResult`

| Field | Meaning |
|---|---|
| `proposals` | Accepted, validated |
| `unknownKeys` | Keys outside the whitelist — dropped and **shown** (FR-036) |
| `unparsedCount` | Items that could not be read (FR-040) |
| `duplicateKeys` | Flagged, not silently merged |
| `rejection` | `{ kind: 'wrong-pack' \| 'unreadable' \| 'wrong-envelope', detail }` |

**Field-value rules**

- Omitted → `null`, meaning *no opinion*. An omission can never clear a human's value (FR-038).
- Booleans are tri-state `boolean | null` for the same reason.
- A value outside a declared enumeration → `null`, never a nearest match (FR-039).

---

## 10. Writing

### `Proposal`

`{ issueKey, conceptOrFieldId, proposedValue, rationale?, source: 'pack' | 'deterministic-fix' }`

`rationale` is displayed and never written to Jira.

### `ChangeSet`

`{ plannedChanges: PlannedChange[], blockers: ChangeBlocker[] }`

`PlannedChange { issueKey, fieldId, fieldLabel, currentValue, proposedValue }`

**Built purely.** A field whose proposed value equals its current value produces no change (FR-043).
`canApply(changeSet)` is `blockers.length === 0`, and a blocker stops the whole action — partial
writes are impossible by construction (FR-044).

### `ApplyOutcome`

`{ results: { issueKey, fieldId, status: 'applied' | 'failed', message? }[] }`

Per item, independent (FR-045). One failure neither prevents nor undoes the others.

### `ChangeLogEntry`

`{ atIso, issueKey, fieldId, method, endpointPattern, outcome }` — append-only, local, capped, and
**bodies deliberately excluded**: this is attribution, not a copy of the data.

---

## Entity relationships

```
WorkspaceConfiguration ──fingerprint──▶ RetrievalRecord ──▶ IssueSet ──▶ DetailedIssue
                        │                                      │
                        │                                      ├──▶ IssueTimeline ──▶ HolderCredit
                        ├──▶ FieldMapEntry ─┐                  │
                        ├──▶ CompletionLens ┤                  │
                        └──▶ enabledCheckIds┘                  │
                                            └──▶ CheckDefinition ──▶ Measure
                                                                        ▲
                                            PromptPack ──▶ PromptChunk  │
                                                       └──▶ Proposal ──▶ ChangeSet ──▶ ApplyOutcome
                                                                                    └──▶ ChangeLogEntry
```

Every arrow into `Measure` carries a `RetrievalRecord` and a fingerprint. That is the whole design:
**a number cannot exist without the account of where it came from.**
