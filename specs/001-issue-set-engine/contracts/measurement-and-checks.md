# Contract: Measurement and Checks

**Modules**: `packages/core/src/measure/measure.ts`, `checks/defineCheck.ts`, `checks/registry.ts`,
`checks/runChecks.ts`, `checks/builtins/*.ts`, `fields/resolveFieldMap.ts`
**Satisfies**: FR-009 – FR-027

This contract is the feature. Everything else is retrieval, presentation, or writing.

---

## 1. `measure()` — the only constructor

```ts
function measure(input: {
  sourceId: string;
  flaggedKeys: readonly string[];
  eligibleKeys: readonly string[];
  issueSet: IssueSet;
  lensId?: CompletionLensId;
}): Measure;
```

There is no other way to build a `Measure`. The type's fields are not publicly constructible, so
every quantity in the product passes through these six rules.

| # | Rule | Prevents |
|---|---|---|
| M-1 | `issueSet.record.failure !== null` → `unresolved`, whatever the caller passed | A failed query rendering as a result |
| M-2 | `eligibleKeys.length === 0` → `not-applicable`, **never** `measured` | An empty population rendering as a pass |
| M-3 | `flaggedKeys ⊄ eligibleKeys` → throws in development, drops the strays in production and reports | A count exceeding its own denominator |
| M-4 | `eligibleKeys ⊄ issueSet.byKey` → same | Counting issues that were never retrieved |
| M-5 | `isPartial` copied from `record.isTruncated` | A floor presented as a total |
| M-6 | `provenance` assembled internally from the issue set and configuration | A number arriving without its account |

**M-2 is the answer to the three-meanings-of-zero problem.** Zero flagged out of forty eligible is a
pass. Zero eligible is not a pass and cannot be rendered as one, because `measure()` will not return
that state.

### There is no `count`

A count is `flaggedKeys.length`. The drill-through renders `flaggedKeys`. FR-010's agreement between a
number and its links is therefore a property of the shape — there is nothing to keep in sync, and
nothing that can drift.

---

## 2. Rendering

```ts
function MeasurementTile(props: { measure: Measure; title: string }): JSX.Element;
```

**The component accepts `Measure` and nothing else.** It has no `number` prop, no `percent` prop, no
`score` prop. Passing a bare number is a compile error, which is how FR-014 is enforced — by the type
system, not by review.

| State | Appearance | Text |
|---|---|---|
| `measured`, flagged > 0 | Attention | "3 of 40" |
| `measured`, flagged = 0 | Pass | "0 of 40 — all clear" |
| `measured`, `isPartial` | Attention, marked | "3 of 40 — at least; retrieval was incomplete" |
| `not-applicable` | Neutral, muted | "0 of 0 — nothing in scope" |
| `unresolved` | Warning | The blocker, in words, plus a route to fix it |

Colour never carries meaning alone; the text states the case (FR-013). A muted `not-applicable` and a
green pass must be distinguishable in a screenshot, in greyscale, by someone who has never used the
tool (SC-009).

### `WhyThisNumber`

Every tile opens a panel showing the exact JQL, the retrieval time, fetched-of-total, the
configuration fingerprint, and — for a check — which Jira field id each required concept resolved to,
with Jira's own name for it. This is FR-015, and it is the difference between a number and a claim.

---

## 3. `defineCheck` — one declaration, one file

```ts
function defineCheck(definition: CheckDefinition): CheckDefinition;

interface CheckDefinition {
  checkId: string;
  title: string;
  whyItMatters: string;
  severity: 'high' | 'medium' | 'low';
  requiredConcepts: readonly ConceptId[];
  isInPopulation: (issue: DetailedIssue, context: CheckContext) => boolean;
  hasFinding: (issue: DetailedIssue, context: CheckContext) => boolean;
  fixPackId?: string;
  buildDrillThroughJql?: (context: CheckContext) => string;
}
```

`registry.ts` imports each definition file and exports `Object.values(registry)`. The catalogue, the
identifier union, the settings screen and the results screen all derive from that one array.

**This deletes the four hand-synced lists the predecessor required, and with them the failure they
caused**: a check that was computed on every scan and then always filtered out, because it had been
added to three lists and not the fourth. It never fired in the live product and nobody knew.

### `CheckContext`

```ts
interface CheckContext {
  readConcept(issue: DetailedIssue, concept: ConceptId): unknown;
  isConceptAvailable(concept: ConceptId): boolean;
  issueSet: IssueSet;
  configuration: WorkspaceConfiguration;
}
```

`readConcept` is the **only** way a check reads a field. There is no path from a check to a raw
`customfield_` id, which is what stopped the predecessor's duplicate default table from being
possible here.

### Rules enforced by test, not by convention

| Test | Asserts |
|---|---|
| `registry.test.ts` | Every exported definition appears in the registry |
| `noRawFieldIds.test.ts` | No `customfield_` literal exists outside `fields/` |
| `noQueriesInChecks.test.ts` | No check module imports anything from `jira/` |
| `checkIdUniqueness.test.ts` | Ids unique; no id literal outside the registry |
| `populationIsDenominator.test.ts` | For every check and a fixture set, `eligibleKeys` equals the issues satisfying `isInPopulation` |

The last one is FR-018 made mechanical. The predecessor kept applicability in a second hand-maintained
table that could drift from the check's own gate; here they are the same function, and the test proves
it stayed that way.

---

## 4. `runChecks`

```ts
function runChecks(
  issueSet: IssueSet,
  configuration: WorkspaceConfiguration,
): ReadonlyMap<string, Measure>;
```

**Order of operations, and it matters**

1. Retrieval failed → every enabled check returns `unresolved`. Nothing else runs.
2. For each enabled check, any required concept not `resolved`:
   - `unmapped` or `ambiguous` → `unresolved` with that blocker. **Evaluation does not run.**
   - `absent` (confirmed) → `not-applicable`, reason naming the concept.
3. Otherwise partition the issues by `isInPopulation`, evaluate `hasFinding` over that population
   only, and hand both arrays to `measure()`.

**Step 2 before step 3 is the whole point.** A check whose field could not be resolved is never
evaluated, so it can never accidentally report that everything passed.

**Aggregates**: any overall figure counts only `measured` results. `not-applicable` and `unresolved`
are excluded and shown separately as "not measurable here (N)", with the reasons (FR-012, FR-013).
There is no denominator into which an unanswerable check disappears.

---

## 5. Field mapping

```ts
async function resolveFieldMap(
  adapter: JiraAdapter,
  stored: Partial<Record<ConceptId, FieldMapEntry>>,
): Promise<FieldMapResolution>;
```

| # | Rule |
|---|---|
| F-1 | `fetchFieldCatalogue` is wrapped in error handling. A failure yields `unresolved` for everything concept-dependent — **never** a scan on defaults. |
| F-2 | Name matching is **exact and case-insensitive**. Substring matching is banned: it is how a field called "Story Points Estimate" gets silently chosen for "Story Points". |
| F-3 | A match is **proposed**, never committed. A confirmed mapping requires a human act (FR-024). |
| F-4 | Multiple matches → `ambiguous`, all candidates shown (FR-026). |
| F-5 | **No default field id exists anywhere in the product** (FR-023). |
| F-6 | A candidate is displayed with its id, Jira's name, its type, and a real value from an issue the user names (FR-025). |

F-5 is not stylistic. The predecessor's hardcoded `customfield_10028` was wrong for this instance,
where story points live in `customfield_10236`. Forty-one pointed issues were reported unpointed, and
"fixes" accepted against them wrote to a field nothing read. Shipping no default means the tool can be
unconfigured, but never confidently wrong.

### `sampleValue`

Read from an issue the user names, during setup. Confirmation by seeing your own data is the only
confirmation that works — a field id and a name can both look right while pointing at the wrong thing,
but a value the user recognises cannot.

---

## 6. Drill-through

`buildDrillThroughJql` uses `clauseNames` from the field catalogue, never the REST field id.

The predecessor generated `"customfield_10108" IS EMPTY`, which Jira rejects; the JQL form is
`cf[10108] IS EMPTY`. The result was a correct count sitting beside a link that returned an error —
which reads to a user as the number being wrong. `clauseNames` gives the alias directly, so the link
and the count are built from the same resolved field.

**Invariant**: opening a check's drill-through in Jira returns the same issues the tile counted. Where
that cannot be guaranteed — because the condition is not expressible in JQL — the tool offers the
issue keys as an explicit key list instead of a condition, and says which it did. It never offers a
query it has not established is equivalent.
