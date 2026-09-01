# Contract: Flow Measures

**Modules**: `packages/core/src/flow/issueTimeline.ts`, `issueFlow.ts`, `workingDays.ts`,
`completionLens.ts`, `throughput.ts`, `cycleTime.ts`, `cumulativeFlow.ts`, `agingWip.ts`,
`flowEfficiency.ts`, `attribution.ts`, `deliveryEvidence.ts`
**Satisfies**: FR-048 – FR-055, FR-049A – FR-049E

Nothing here reads a sprint (FR-048). Sprint membership is not an input to any function in this
contract, which is why the measures survive the move to Kanban — and why they were worth building
rather than fixing velocity.

---

## 1. Timeline reconstruction

Lifted from the predecessor's proven modules. `buildStateSegments` and `businessMillisBetween` already
work, are already tested, and are already sprint-agnostic.

```ts
function buildIssueTimeline(
  issue: DetailedIssue,
  calendar: WorkingCalendar,
): IssueTimeline;
```

**`isReconstructable` is `false` when `changelog === null`.**

Such issues are excluded from every figure and **counted in an exclusion report shown beside the
charts** (FR-054). They are never treated as zero, never quietly dropped, and never counted as
"not completed" — which would be a claim the data does not support.

`null` changelog means *not retrieved*. An empty array means *no history*. The distinction is
load-bearing: collapsing them turns a missing fetch into a confident number.

---

## 2. Completion lenses

```ts
interface CompletionLens {
  lensId: 'delivered-to-int' | 'released-to-prod';
  label: string;
  completedWhen: StatusCondition;
  startedWhen: StatusCondition;
}

function findCompletionMs(timeline: IssueTimeline, lens: CompletionLens): number | null;
function findStartMs(timeline: IssueTimeline, lens: CompletionLens): number | null;
function buildVerifyingJql(lens: CompletionLens, scopeJql: string,
                           periodStartIso: string, periodEndIso: string): string;
```

| Lens | Default condition | Role |
|---|---|---|
| `released-to-prod` | Jira's `done` status category | Reconciles with an untouched Jira report — the figure nobody can argue with |
| `delivered-to-int` | The team's named integration-test status | The Definition of Done; the lens PI commitments are judged by |

**Conventions, stated on screen and not merely in code** (FR-049):

- Completion is the **most recent** qualifying entry within the period. A regression followed by a
  second completion counts once, in the later period — a regression cannot inflate a count.
- Start is the **first** entry into a `startedWhen` status, ever. An item worked, parked, and resumed
  carries its true age rather than a flattering restart.
- An item completing without ever having started is reported as an exception with a stated convention,
  never as a zero-day cycle time that would distort every percentile.

### `buildVerifyingJql` — the promise that makes the numbers checkable

Emits, per lens and period:

```
(<scope JQL>) AND status CHANGED TO ("Ready for Integration Test") DURING ("2026-06-01", "2026-06-30")
```

Data Center supports `CHANGED TO ... DURING` against the same change history the tool reads, so the
two agree by construction. Status is one of the six fields history operators support, which is exactly
what both lenses are defined on.

**Invariant (SC-006)**: for any period and lens, running the emitted query in Jira returns the same
issue count the chart displays. This is asserted in integration tests against recorded fixtures, and
verified by hand against the live instance during quickstart.

### Cross-lens invariants (FR-049D, SC-006A)

```
completedUnder('released-to-prod', period) ⊆ completedUnder('delivered-to-int', period ∪ earlier)
```

- An item released to production must have been delivered to integration test at some point.
- An item delivered but not released is **in progress** under the production lens — present in both
  views, finished in one.
- The containment failing is a **fault**: reported as a data or configuration problem, never rendered
  as a result. A tool that can show its own contradiction and calls it a result is back where the
  predecessor was.

---

## 3. The six measures

Each returns a `Measure` plus its chart series. Each carries `lensId` in its provenance, so no reader
can mistake which definition produced it.

| Module | Computes | Answers |
|---|---|---|
| `throughput` | Items completed per ISO week + 4-week rolling mean; split by issue type for work mix | "We complete N items a week, steadily" |
| `cycleTime` | Per completed item: business time start→completion. Percentiles 50/85/95 | "85% of our work finishes within N days" |
| `cumulativeFlow` | Daily count per status band, reconstructed from timelines | Widening bands are WIP growth — the carry-over, made visible |
| `agingWip` | Every currently-unfinished item's age against the percentile bands | "These four are older than 85% of everything we have ever finished" |
| `flowEfficiency` | Active ÷ (active + waiting) from `buildIssueFlow` | "Work waits 62% of its life — the constraint is queueing, not effort" |
| `attribution` | Per-holder share of each item's elapsed time | Who held the work, without double-counting |

**Switching the lens recomputes all six** (FR-049B). They are pure functions of
`(timelines, lens, calendar)`, so a mixed-lens screen is not reachable — there is no state in which
one chart holds a stale lens.

---

## 4. Attribution — the double-count fix

The predecessor credited a full item, and its full story points, to **each** person who held it. An
issue touched by four people added four to the team column. Per-person columns did not sum to the team
total, and once someone noticed, every number on the page became suspect.

Two rules make it structurally impossible:

```ts
function countTeamThroughput(timelines, lens): Measure;      // over a Set<issueKey>
function allocateHolderCredit(timeline): readonly HolderCredit[];  // shares sum to 1.0
```

| # | Rule |
|---|---|
| A-1 | Team totals consume a `Set<issueKey>`. An item is counted once, by construction, regardless of holders (FR-051). |
| A-2 | Per-person attribution divides **elapsed business time**, not points or item counts. Shares sum to exactly 1.0 per item (FR-052). |
| A-3 | Time with no assignee is credited to an explicit `UNASSIGNED` holder, never to whoever picked it up next (FR-053). |

**Asserted in tests and at runtime in development**:
`sum(shareOfIssue) === 1.0 ± 1e-9` per item, and `sum(perPersonTotals) === teamTotal` per period.

A separate, deliberately **non-additive** "items touched" count is offered alongside, labelled as
non-additive. Both the honest number and the intuitive one are available, and neither is mistaken for
the other.

---

## 5. Working time

```ts
interface WorkingCalendar { weekendDays: readonly number[]; holidayIsoDates: readonly string[]; }
function businessMillisBetween(fromMs: number, toMs: number, calendar: WorkingCalendar): number;
```

Millisecond-precision weekend and holiday clipping, lifted from the predecessor. Every duration in
this contract is business time; mixing units would make two charts disagree by every weekend, which is
the kind of discrepancy that ends a conversation about whether the tool can be trusted.

---

## 6. Delivery Evidence

```ts
function buildDeliveryEvidence(input: {
  issueSet: IssueSet;
  lens: CompletionLens;
  measures: FlowMeasureSet;
  configuration: WorkspaceConfiguration;
}): DeliveryEvidenceDocument;
```

One exportable document (FR-055) containing:

- The six charts, each naming the lens in force.
- **Every contributing issue key, with a link** — not a sample.
- The exact JQL, verbatim, and the verifying query for the lens.
- Fetched-of-total, the retrieval time, and the exclusion count with reasons.
- The workspace fingerprint.

**The point is not the charts.** It is that a reader who distrusts the author can reproduce the
headline figure from Jira alone (SC-011). The argument stops being "trust our numbers" and becomes
"here is the query — check it."

**Every chart element drills through** to exactly the issues it represents, and the length of that
list equals the number displayed (FR-050, FR-010). A chart whose elements cannot drill through is not
shipped.
