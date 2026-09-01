# Quickstart: Validating the Issue Set Engine

**Feature**: `001-issue-set-engine` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

How to prove this feature works, end to end, against a real Jira. Scenarios are ordered so each one
is demonstrable on the day it is built — a failing scenario names the day whose work is not finished.

Types and rules referenced here are defined in [data-model.md](./data-model.md) and
[contracts/](./contracts/); they are not repeated.

---

## Prerequisites

- Node.js 20 or later.
- A Jira Data Center personal access token for an account that can browse the target projects, and
  edit issues for the write scenarios.
- One real JQL query returning roughly 100–300 issues from the team's own work.
- One issue key whose story points and acceptance criteria are populated — used to confirm field
  mapping by sight.
- Microsoft Copilot open in a browser tab.

## Setup

```powershell
npm install
npm run dev            # server on 5555, client with hot reload
```

On first run the app has no configuration and says so. Supply the Jira base URL and the token when
prompted. **Nothing else is required before the first scenario works.**

## The commands

```powershell
npm test               # every unit test, mocked, in packages/core
npm run test:contract  # integration tests against recorded Jira fixtures
npm run lint
npm run build
```

---

## Scenario 1 — It sees the data, and admits what it did not see

*Proves: FR-001 – FR-008. Day 1.*

1. Paste the real JQL query and run it.
2. **Expect** every matching issue listed, under a provenance banner reading
   `312 of 312 retrieved — complete`, with the time, the fingerprint, and a Copy button holding the
   query byte for byte.
3. Copy that query, run it in Jira directly. **Expect** the same count.

### 1a — A wrong field is red, not green

4. Run `project = ENCUC AND cf[99999] IS EMPTY`.
5. **Expect** an explicit failure carrying Jira's own message, and **no count, no chart, no table, no
   score anywhere on the page.**

> This is the predecessor's defining defect. There, the same query returned nothing and rendered as a
> perfect score. If anything green appears here, the feature has failed regardless of what else works.

### 1b — Truncation is visible

6. Set the retrieval ceiling to 50 and run a query matching more.
7. **Expect** `50 of 312 retrieved — incomplete`, and every derived figure marked as a floor.

### 1c — The clamp does not shorten the answer

8. Set the page size to 2,000 — above Jira's default cap of 1,000.
9. **Expect** the full result set still retrieved. Jira silently clamps the *page*, not the *results*;
   paging follows Jira's own total. A short page must never be read as the end.

---

## Scenario 2 — A full Copilot round trip

*Proves: FR-032 – FR-041, FR-035A. Day 1.*

1. From a retrieved set, choose **Ask anything** and type a real question.
2. **Expect** the part count shown *before* copying — `Prompt: 3 parts`.
3. Copy part 1, paste into Copilot, paste the reply back.
4. **Expect** part 1 marked returned, parts 2 and 3 still pending, and the result labelled as covering
   1 of 3.
5. Complete parts 2 and 3. **Expect** the result labelled complete.

### 2a — Invented keys are dropped and named

6. Before pasting, edit one item's key to `ZZZZ-999`.
7. **Expect** that item dropped, the key listed under "not in this set", and the rest applied.

### 2b — A reply from the wrong pack is refused

8. Paste a `delivery-narrative` reply into `fix-acceptance-criteria`.
9. **Expect** the whole reply rejected, naming the mismatch. **Expect** no partial ingest.

### 2c — Silence changes nothing

10. Paste a reply omitting a boolean field entirely.
11. **Expect** the existing value untouched, and the field reported as "no opinion" — never unticked.

---

## Scenario 3 — Delivery evidence a sceptic can check

*Proves: FR-048 – FR-055, FR-049A – FR-049E. Day 2.*

1. Scope six months of the team's work and open the flow view.
2. **Expect** the completion condition stated in words above the charts, and the lens named.
3. Pick one week on the throughput chart. **Expect** the drill-through to list exactly as many issues
   as the bar shows.

### 3a — Both lenses, and each one checkable

4. Switch to **released to production**. **Expect** all six measures to recompute together.
5. Use *how would I check this?* to get the verifying query.
6. Run it in Jira for the same week. **Expect** the identical count. Repeat for
   **delivered to integration test**.

> This is the whole trust argument. The number is not asserted — it is reproducible without the tool.

### 3b — The lenses cannot contradict each other

7. Compare the two for any period. **Expect** delivered ≥ released, and every released item also
   present in delivered.

### 3c — Per-person figures sum

8. Open the per-person breakdown. **Expect** the columns to sum exactly to the team total.
9. Find an issue held by three people. **Expect** it to add **one** to the team total, not three.

### 3d — Missing history is reported, not zeroed

10. Retrieve without changelog and open the flow view.
11. **Expect** the affected issues reported as not measurable, with a count — never counted as
    incomplete work.

### 3e — The export stands alone

12. Export the Delivery Evidence document.
13. **Expect** the charts, **every** issue key with a link, the JQL, the verifying query, fetched-of-total,
    the exclusion count and the fingerprint.
14. Hand it to someone who has not seen the tool. **Expect** them to reproduce the headline figure
    from Jira unaided.

---

## Scenario 4 — Field mapping confirmed by your own data

*Proves: FR-022 – FR-027. Day 3.*

1. Open setup on an unconfigured install. **Expect** every concept listed as unmapped, with candidates
   **proposed and none selected**.
2. Name the known issue key. **Expect** each candidate to show its id, Jira's own name, its type, and
   a real value from that issue.
3. Confirm story points. **Expect** the value shown to be the one you can see in Jira.

### 4a — Ambiguity is surfaced

4. On an instance with two similarly named fields, **expect** both offered and a choice required —
   never a silent first-wins.

### 4b — Absent is not unmapped

5. Record a concept as absent from this instance. **Expect** its checks to read grey
   `not applicable`, excluded from aggregates — and distinct from amber `not measurable`.

---

## Scenario 5 — The trust demo

*Proves: FR-009 – FR-021C. Day 3. **The five minutes that make the case.***

1. Run the checks over a real set. **Expect** every tile to read `N of M`.
2. Click any number. **Expect** exactly that many issues.
3. Click the denominator. **Expect** exactly the population the check applies to.

### 5a — Unmap a field, watch it refuse to lie

4. Un-map the acceptance criteria concept.
5. **Expect** its check to turn **amber, "not measurable"**, naming the concept and offering a route
   to setup. **Expect it not to turn green.**
6. **Expect** `missing-fix-version` to stay measurable — it needs no mapped concept, which is why it
   is in the shipped three.

### 5b — Zero has three faces

7. Find a check with a population and no findings. **Expect** green `0 of 40`.
8. Scope to issues no check applies to. **Expect** grey `0 of 0 — nothing in scope`.
9. **Expect** those two, plus the amber from 5a, to be distinguishable in greyscale by someone who has
   never used the tool.

### 5c — The seventy-two

10. Run `missing-fix-version` over a backlog with stories lacking a fix version.
11. **Expect** stories, tasks and defects included — not only feature-level issues. The predecessor
    reported nothing here across seventy-two affected items.

### 5d — A failed retrieval poisons everything

12. Run the checks over a failed retrieval. **Expect** every check amber and **no overall score at
    all**.

---

## Scenario 6 — Writing, reviewed and recorded

*Proves: FR-042 – FR-047. Day 4–5.*

1. Accept proposals for three issues and choose apply.
2. **Expect** a `was → will be` table before any request is sent.
3. **Expect** a field whose proposal equals its current value to be absent from the table.
4. Apply. Open those issues in Jira. **Expect** the changes.
5. Open the change log. **Expect** all three, with issue, field and time.

### 6a — One failure does not take the others

6. Apply five where one will fail. **Expect** four applied, one failure carrying Jira's reason, and no
   rollback.

### 6b — A blocker stops everything

7. Include a proposal for an unmapped concept. **Expect** the whole action refused with the reason,
   and **no** partial write.

### 6c — Deterministic fixes need no prompt

8. Run `set-missing-fix-version`. **Expect** the same reviewable diff, with no prompt authored and no
   Copilot involved.

---

## Scenario 7 — Two people, two installs

*Proves: FR-028 – FR-031, FR-030A, FR-030B. Day 3.*

1. Note the fingerprint in the header.
2. Export the configuration; import it into a second install.
3. **Expect** the fingerprints to match exactly, and the same query to give identical numbers.
4. Change a lens definition on one. **Expect** the fingerprints to diverge, visibly, on both exports.
5. **Expect** a result produced before the change to keep its old fingerprint and be marked stale.

---

## Automated coverage

| Suite | Asserts |
|---|---|
| `measure.test.ts` | All six constructor invariants, especially empty population → `not-applicable` |
| `registryIntegrity.test.ts` | Every check registered; no id literal outside the registry |
| `noRawFieldIds.test.ts` | No `customfield_` outside `fields/` |
| `noQueriesInChecks.test.ts` | No check imports from `jira/` |
| `populationIsDenominator.test.ts` | `eligibleKeys` equals the `isInPopulation` set |
| `attribution.test.ts` | Holder shares sum to 1.0; per-person sums to team total |
| `lensContainment.test.ts` | Released ⊆ delivered, every period |
| `paging.test.ts` | A clamped page does not end a retrieval; a failed page is not an end |
| `packReply.test.ts` | The full validation ladder, each rung |
| `fingerprint.test.ts` | Insignificant fields excluded; import reproduces the exporter's value |

---

## Done when

Every scenario passes against the real instance, `npm test` and `npm run test:contract` are green, and
the Delivery Evidence export has been handed to one person who reproduced its headline figure without
help.

That last one is the acceptance test that matters. The others prove the code works; it proves the
product does.
