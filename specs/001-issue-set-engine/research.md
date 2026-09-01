# Phase 0 Research: Issue Set Engine and Trust Architecture

**Feature**: `001-issue-set-engine` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

Every unknown that could change the shape of the plan, resolved. Items that remain unconfirmed are
marked as such rather than guessed, because this feature exists to stop confident wrong answers.

---

## R1 — Does Jira Data Center return change history with a search?

**Decision**: Request `expand=changelog` on the search call. Retrieve history in the same request as
the issues, for the retrievals that need it.

**Rationale**: On Data Center the changelog returned by `/rest/api/2/search?expand=changelog` is
**complete and uncapped**. Atlassian's own open request to cap it
([JRASERVER-59998](https://jira.atlassian.com/browse/JRASERVER-59998), still Gathering Interest) says
in its description that full history is returned today and "may cause OOM easily" — which is a
complaint about payload size, not a truncation we would have to work around.

**This is a Cloud/DC divergence and the direction matters.** Cloud caps changelog at 100 entries in
search results; Data Center does not. A design built from Cloud documentation would have added a
pagination path that DC does not need — and, worse, might have assumed a cap that silently loses
history if the tool is ever pointed at Cloud.

**Alternatives considered**:

- *Per-issue changelog endpoint* — **not available on Data Center**. `/rest/api/2/issue/{key}/changelog`
  is Cloud-only and returns 404 on DC. The fallback, if ever needed, is
  `/rest/api/2/issue/{key}?expand=changelog`, one request per issue.
- *Always request changelog* — rejected. See R3.

**Consequence for the plan**: the flow measures (User Story 2) have their data from the first
retrieval, at no additional request. The risk this research was commissioned to find did not
materialise, and the delivery order in the plan stands.

---

## R2 — Is `/rest/api/2/search` still the right endpoint?

**Decision**: Use `/rest/api/2/search` with `startAt`/`maxResults` offset pagination. Use POST when
the query would make the URL too long, GET otherwise.

**Rationale**: Current and non-deprecated on Data Center 9.x through 11.x. Jira **Cloud** deprecated
its equivalent in May 2025 in favour of `/rest/api/3/search/jql` with token pagination, and the old
Cloud endpoint now returns 410 Gone — but no equivalent change has landed on DC. The DC "Search API
deprecations" guide for Jira 11 concerns internal Lucene-facing Java APIs moving toward OpenSearch,
and explicitly does not touch the public REST endpoint.

**Consequence**: the `JiraAdapter` boundary earns its place immediately. Offset pagination versus
token pagination is exactly the kind of difference the adapter exists to absorb, and it is a real,
already-shipped difference rather than a hypothetical one.

---

## R3 — How large can a retrieval get, and what silently goes wrong?

**Decision**: Three rules, all enforced in `fetchIssuesPaged`.

1. **Never infer the end of results from a short page.** Page against Jira's reported `total` and the
   running `startAt`. A page smaller than requested means the server clamped the page size, not that
   the results ran out.
2. **Always send an explicit `fields` list.** `*all` is available as a deliberate, user-visible toggle
   for the free-form question format, never as a default.
3. **Request `expand=changelog` only when the retrieval feeds a flow measure**, and record the result
   in `changelogCoverage`.

**Rationale — and this is the important finding.** `jira.search.views.default.max` defaults to 1000
on Data Center, and a request for more is **silently clamped, not rejected**. Asking for 2000 returns
1000 with no error and no warning. That is precisely the failure class this feature exists to
eliminate: a quiet narrowing that looks exactly like a complete answer. Rule 1 makes the clamp
harmless — paging continues until `total` is reached or the configured ceiling is hit, and the ceiling
case is reported as truncation.

Field selection carries a second quiet narrowing: omitting `fields` on `/search` defaults to
`*navigable`, not to everything, so a custom field can be absent from a response that looks complete.
Naming fields explicitly removes the ambiguity. Atlassian's own guidance is that field filtering
yields large payload and latency improvements on instances with many custom fields.

**Alternatives considered**:

- *Default to `*all` everywhere* — rejected. Combined with uncapped changelogs on a 2,000-issue
  retrieval this is the OOM scenario Atlassian warns about, and it would make every query pay the cost
  of the most demanding one.
- *Raise the instance cap* — rejected. It requires a config file change and a restart, and the tool
  must work on an instance it does not control.

---

## R4 — Can a figure be reproduced by a query the user runs in Jira?

**Decision**: Yes, for both completion lenses. Each lens emits a verifying query using
`status CHANGED TO "<status>" DURING ("<start>", "<end>")`.

**Rationale**: Data Center supports the `CHANGED` operator with `TO`, `FROM`, `BY`, `BEFORE`, `AFTER`,
`ON` and `DURING` predicates, and supports `WAS` / `WAS IN`. These operate on the same change history
the tool reads, so the two agree by construction rather than by coincidence. `resolutiondate` and
`statusCategory` are both queryable, which covers the released-to-production lens.

**The one restriction, and why it does not bite**: history operators work only on Assignee, Fix
Version, Priority, Reporter, Resolution and **Status**. Status is what both lenses are defined on, so
FR-049C is fully deliverable. A future measure defined on a custom field's history could not be
verified this way — worth knowing before someone designs one.

**A second finding, better than expected**: `GET /rest/api/2/field` returns `clauseNames` for every
field, giving the JQL-safe alias (for example `cf[10236]`). This means the "open these issues in Jira"
link behind every hygiene count can be built for mapped custom fields too, not only for status. The
predecessor generated an invalid link here by using the REST field name where JQL needed the alias,
producing a count that was right beside a link that 400'd. `clauseNames` removes the guesswork.

---

## R5 — Authentication

**Decision**: Personal Access Token, sent as `Authorization: Bearer <token>`, injected server-side and
never exposed to the browser.

**Rationale**: PATs have been available on Data Center since 8.14 and act as the creating user with
exactly that user's permissions — no elevation, no reduction. This satisfies FR-058 structurally: the
tool cannot exceed the operator's own access, so no administrative rights are needed anywhere.

**Note the Cloud difference**: Cloud uses email plus API token over HTTP Basic. The `Bearer` form is
DC-specific, and belongs behind the adapter with the pagination difference from R2.

---

## R6 — Rate limiting

**Decision**: Treat 429 as a first-class outcome. Honour `Retry-After`, back off, and surface a
rate-limited retrieval as an explicit failure rather than a partial result.

**Rationale**: Rate limiting on Data Center is admin-configurable and off by default, so it may never
fire on this instance — but if it does, it returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Interval-Seconds`, `X-RateLimit-FillRate` and `Retry-After`. Retrying before `Retry-After`
elapses extends the penalty.

**Why it matters more here than usual**: a rate-limited page mid-retrieval would otherwise produce a
short page, and rule 1 of R3 would keep paging into repeated failures. The pager must distinguish "the
server is throttling" from "there are no more results" — two conditions that look identical if only
the page length is inspected.

---

## R7 — Charting

**Decision**: Recharts, already proven in the predecessor against this environment.

**Rationale**: It covers all six required forms — line with rolling mean, scatter with reference
lines for percentile bands, stacked area for accumulation, and a banded scatter for ageing work. The
Framework-First gate (Article VII) forbids reaching for a lower-level drawing library when a charting
dependency already in use provides the capability.

**Alternatives considered**: hand-rolled SVG or d3 — rejected outright under Article VII. No
documented gap exists.

---

## R8 — Sharing one engine between browser and server

**Decision**: An npm workspace, `packages/core`, containing every rule, compiled for both the browser
and Node.

**Rationale**: The predecessor's single most damaging structural defect was a hand-written server port
of its client rules, guarded by a parity test that compared only identifiers and severities — never
logic. Five divergences were live simultaneously, including a check restricted to the wrong issue
types and a story-points field id that was wrong for this instance. The emailed digest and the
interactive screen could disagree about the same issues, and did.

A shared compiled package makes that class of drift **impossible rather than tested for**. The
predecessor had already proved the mechanism works, bundling browser modules for server use.

**Alternatives considered**: duplicating rules with a stricter parity test — rejected. A test that
compares behaviour thoroughly enough to catch logic drift is harder to write, and to keep correct,
than not duplicating the code.

---

## R9 — Testing approach, and a recorded deviation

**Decision**: Vitest for mocked unit tests. Integration tests against a recorded-fixture server
standing in for Jira. No Cypress, no testcontainers.

**Rationale**: Article V mandates integration tests on real infrastructure via testcontainers, and UX
tests in Cypress with `cypress-real-events`. Neither fits: **there is no container to run**, because
Jira is an external corporate system this project does not host, and a container cannot stand in for
the instance-specific field and status configuration that the whole feature is about. Recorded
fixtures captured from the real instance test more of what matters — the actual field ids, the actual
status names, the actual clamping behaviour — than a generic container would.

**This is a deviation from the constitution and is recorded as one**, not quietly taken. It is carried
into the plan's Complexity Tracking table for explicit acceptance. The spirit of Article V — three
separated layers, real data at the integration layer, tests before implementation — is preserved in
full.

---

## Remaining unconfirmed

Stated plainly rather than smoothed over. None blocks the plan; each is settled by one request against
the real instance during the first implementation step.

| Item | Why unconfirmed | How it is settled |
|---|---|---|
| Verbatim DC documentation for `/search`, `/field` and board configuration | Atlassian's developer site renders client-side and could not be fetched in full; verdicts are triangulated from issue trackers, KB articles and support documentation | One request each against the live instance |
| Permission required for `GET /rest/api/2/field` | Inferred from Cloud parity; no DC-specific statement located | Call it with the operator's own token |
| Permission required for board configuration | Inferred from the UI permission model and community reports | Call it with the operator's own token — relevant to feature 002, not this one |
| The instance's configured `jira.search.views.default.max` | Instance-specific by definition | Request a page larger than the default and observe the clamp |

**The first implementation task is a connectivity probe that answers all four at once and records the
answers.** That is cheaper than reading documentation, and it is evidence rather than inference —
which is the standard this feature holds everything else to.
