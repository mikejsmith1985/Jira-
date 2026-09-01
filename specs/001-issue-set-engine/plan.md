# Implementation Plan: Issue Set Engine and Trust Architecture

**Branch**: `feature/issue-set-engine` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-issue-set-engine/spec.md`

**Artifacts**: [research.md](./research.md) · [data-model.md](./data-model.md) ·
[contracts/](./contracts/) · [quickstart.md](./quickstart.md)

## Summary

Jira+ replaces a predecessor that works and is not used, because its numbers could not be checked and
so were not believed. The whole product reduces to one engine: **a JQL query produces one frozen,
provenance-stamped Issue Set, and every feature is a pure function over that set rather than a query
of its own.**

That single restriction eliminates the defining defect by construction. In the predecessor a query
naming a non-existent field returned nothing, and nothing rendered as a perfect green score; here
there is no second query left to go wrong, and a quantity can only be expressed as a `Measure` whose
constructor refuses to return a passing state when the population is empty or the data was
unobtainable. A count is the length of the array the drill-through renders, so a number and its links
cannot disagree.

On that foundation sit four things the user needs: a free-form Copilot round trip over any query,
sprint-free Kanban flow measures under two completion lenses that each emit the Jira query that
reproduces them, quality checks that report `N of M` with honest gaps, and reviewed per-item writes
with a change log.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+

**Primary Dependencies**: React 19, Vite, Zustand (ephemeral UI state only), TanStack Query (server
state), Recharts, Express 4, Vitest. All proven in the predecessor against this Jira instance and this
corporate network.

**Storage**: One JSON configuration document under the user profile directory. No database. The
append-only change journal is a second local file.

**Testing**: Vitest for mocked unit tests. Integration tests against fixtures recorded from the real
Jira instance, by a committed re-runnable script, which is what Article V prescribes for a
third-party system this project does not own.

**Target Platform**: Local web application. Express serves the built client on `localhost`; Chromium
or Edge in the corporate environment.

**Project Type**: Web application with a shared engine package — three npm workspaces
(`core`, `server`, `client`).

**Performance Goals**: A 300-issue retrieval with full detail and change history completes inside 30
seconds. Chart interaction and drill-through are instant, because every measure is a pure function
over already-retrieved data with no further network access.

**Constraints**: One credential, a Jira Data Center personal access token, never exposed to the
browser. No administrative rights on any Jira project. Prompt transfer is copy and paste with a budget
below Copilot's ~18,000-character input. Corporate TLS inspection must be tolerated. Jira's page-size
cap is silently clamped, so paging must follow Jira's own reported total.

**Scale/Scope**: One team, one user, for the first two weeks. Retrieval ceiling defaults to 2,000
issues, configurable, with truncation always visible. Five user stories, 70 functional requirements,
3 quality checks, 4 prompt packs, 6 flow measures.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design. One recorded deviation.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive | Production-readiness over speed | **Pass.** The trust architecture is more work than displaying numbers and is the entire point. |
| II — Process Protection | No wildcard process kills | **Pass.** No process management in this feature. |
| III — Branching | Feature branch, PR to main | **Pass.** `feature/issue-set-engine`; one branch per day's slice. |
| IV — Code Quality | Self-documenting names, `is`/`has`/`can`/`should` booleans, verb-first functions, file purpose comments, doc comments on exports, functions under 40 lines, guard clauses, no magic numbers | **Pass.** Named constants cover the transfer budget, retrieval ceiling and page size — all three are also user-configurable, so none may be a literal. |
| V — Testing | Three layers; unit under 10ms and fully mocked; TDD Red→Green→Refactor; integration against the real thing, by the route the Article prescribes for who owns it | **Pass.** Article V was amended on 2026-09-01 to distinguish infrastructure this project runs (testcontainers, mandatory) from a third-party system it does not own (fixtures recorded from the real instance, with a generic vendor container explicitly rejected). Jira is the latter. The UX layer is scoped to features with real browser interaction; this feature has none, and 002's drag-to-move brings it. |
| VI — Documentation | CHANGELOG is the only status document | **Pass.** `specs/001-issue-set-engine/` is a pipeline artifact and exempt. No auxiliary summaries. |
| VII — Framework-First | Confirm the framework does not already provide it | **Pass.** Recharts for all six charts rather than hand-rolled SVG; TanStack Query for fetch lifecycle rather than another hand-written hook — the predecessor rebuilt that in every hook, which is exactly the waste this gate exists to stop. Custom code is limited to domain logic no dependency supplies: `searchIssuesByJql`, `Measure`, `CheckDefinition`, `PromptPack`, the flow engine. |
| VIII — Release | Local pipeline only, never GitHub Actions | **Pass.** No release in this feature; no workflow files added. |
| IX — Vault | Secrets never in plaintext to the agent | **Pass.** The Jira token is supplied by the operator at setup and stored server-side. No secret enters source, a log, or the conversation. |
| X — Verification | Behaviour proved with evidence, not "it compiles" | **Pass, and it is the feature's own thesis.** [quickstart.md](./quickstart.md) validates against the live instance; the Delivery Evidence export is verified by a third party reproducing its headline figure. |
| XI — Output Restraint | At most one dashboard file; no unrequested summaries | **Pass.** |
| XII — Response Format | Tight, scannable, sectioned | **Pass.** |

**Post-design re-check**: no new violations. The design reduced custom surface rather than adding it —
one retrieval path replacing per-view fetches, one check declaration replacing four hand-synced lists,
one pack runtime replacing sixteen prompt/parser pairs.

## Project Structure

### Documentation (this feature)

```text
specs/001-issue-set-engine/
├── plan.md                        # This file
├── spec.md                        # 70 FRs, 13 SCs, 4 clarifications
├── research.md                    # Phase 0 — nine decisions, four unconfirmed items named
├── data-model.md                  # Phase 1 — entities, invariants, state transitions
├── quickstart.md                  # Phase 1 — seven validation scenarios
├── checklists/requirements.md     # Spec quality, 16/16
├── contracts/
│   ├── retrieval.md               # Adapter, probe, paging, provenance, typed failures
│   ├── measurement-and-checks.md  # measure(), defineCheck, field mapping, drill-through
│   ├── flow-measures.md           # Timelines, lenses, six measures, attribution, evidence
│   ├── prompt-packs.md            # One declaration, chunking, the validation ladder
│   └── apply-and-workspace.md     # Change sets, writers, journal, config, fingerprint, server
└── tasks.md                       # Phase 2 — created by /speckit-tasks, NOT here
```

### Source Code (repository root)

```text
packages/
├── core/                          # TypeScript, zero DOM — runs in browser AND Node
│   ├── src/
│   │   ├── jira/                  # jiraAdapter · dataCenterAdapter · searchIssuesByJql
│   │   │                          # fetchIssueSet · fetchIssuesPaged · fieldCatalogue
│   │   │                          # transitions · write/fieldWriters · write/resolveFieldWriteRoute
│   │   ├── model/                 # issueSet · detailedIssue · retrievalRecord
│   │   ├── measure/               # measure — the only constructor for a quantity
│   │   ├── checks/                # defineCheck · registry · runChecks · builtins/*
│   │   ├── fields/                # resolveFieldMap · fieldMapEntry
│   │   ├── flow/                  # issueTimeline · issueFlow · workingDays · completionLens
│   │   │                          # throughput · cycleTime · cumulativeFlow · agingWip
│   │   │                          # flowEfficiency · attribution · deliveryEvidence
│   │   ├── packs/                 # promptPack · packRegistry · buildPromptChunks
│   │   │                          # parsePackReply · extractJsonPayload · definitions/*
│   │   ├── apply/                 # buildChangeSet · runApplyPlan · proposal
│   │   └── workspace/             # workspaceConfig · fingerprint
│   └── test/                      # unit (mocked, <10ms) + invariant suites
├── server/
│   ├── server.js                  # Express entry
│   ├── routes/                    # jiraProxy · workspace · writeJournal · health
│   ├── config/loader.js           # Credential + config file, AppData
│   ├── services/writeJournal.js
│   ├── utils/httpClient.js        # TLS-inspection tolerant
│   └── test/                      # integration against recorded fixtures
└── client/
    ├── src/
    │   ├── views/                 # Setup · QueryConsole · Flow · Hygiene · ChangeLog
    │   ├── components/            # MeasurementTile · WhyThisNumber · ProvenanceBanner
    │   │                          # PackPanel · ChangeDiffTable · FieldMappingConfirm
    │   └── state/                 # Ephemeral UI only — never anything affecting a number
    └── test/
```

**Structure Decision**: three npm workspaces, and `packages/core` is the load-bearing one. It compiles
for both the browser and Node from a single source, which makes the predecessor's most damaging
structural defect **impossible rather than tested for**: there, a hand-written server port of the
client rules carried five simultaneous divergences — including a check gated to the wrong issue types
and a story-points field id wrong for this instance — behind a parity test that compared only
identifiers and severities, never logic. The emailed digest and the interactive screen could disagree
about the same issues, and did. One compiled engine removes the possibility.

`client` holds no rules. Every number it renders arrives from `core` as a `Measure`, and its
components accept no bare numbers.

### Delivery slices

Each is a branch, a PR, a CHANGELOG entry, and a demonstrable artifact. Ordering is by
demonstrability: the earliest possible day on which someone can watch the tool do something useful.

| Slice | Branch | Story | Artifact |
|---|---|---|---|
| 0 | `chore/scaffold-and-probe` | — | Workspaces, proxy lifted and stripped, and the **capability probe** answering the four items research could not confirm |
| 1 | `feature/issue-set-engine` | US1 | Paste real JQL → every issue, under a provenance banner. Both failure modes demonstrated. |
| 2 | `feature/prompt-pack-runtime` | US1 | Full Copilot round trip with per-part tracking and honest rejection counts |
| 3 | `feature/kanban-flow` | US2 | Delivery Evidence export on the real team, both lenses, each with its verifying query |
| 4 | `feature/field-mapping` | US3 | Mapping confirmed by seeing your own data; fingerprint in the header |
| 5 | `feature/checks-and-measures` | US4 | **The trust demo** — unmap a field, the tile goes amber |
| 6 | `feature/apply-pipeline` | US5 | Diff, per-item apply, change log |

Slice 0 first because its probe decides nothing less than whether slice 3 costs one request or three
hundred. Slice 5 comes late by design: the machinery it demonstrates is built in slices 1 and 3, so
the demo is assembly rather than construction.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
**No violations outstanding.** Both testing questions that would previously have appeared here were
resolved by amending Article V itself on 2026-09-01, rather than by taking a deviation against it.

The Article now distinguishes infrastructure the project *runs* — where testcontainers remain
mandatory and a mocked driver is forbidden — from a third-party system the project does **not** own,
where fixtures recorded from the real instance are the required approach and a generic vendor
container is explicitly rejected: it reproduces the vendor's defaults rather than this instance's
field identifiers, status names, permissions and limits, so it would pass while the tool remained
wrong about the only Jira that matters. It also scopes the UX layer to features with genuine browser
interaction, so restating a pure state-render assertion in a browser is no longer implied.

This feature therefore complies as written. Feature 002's drag-to-move introduces a real pointer
interaction and brings the Cypress layer with it.

## Risks

| Risk | Handling |
|---|---|
| Uncapped change histories on Data Center make large retrievals heavy — Atlassian's own words are "may cause OOM easily" | Changelog is requested only when a flow measure needs it; explicit field lists always; ceiling configurable and truncation always visible |
| Jira silently clamps page size above ~1,000 | Paging follows Jira's reported total, never page length. A short page never ends a retrieval. Covered by `paging.test.ts` and quickstart 1c |
| Copilot reply quality varies between sessions and cannot be regression-tested | Nothing auto-applies. Whitelisting, tri-state fields, honest reject counts. A poor reply costs a re-paste, never a bad write |
| Multi-part prompts are the norm at 18,000 characters, so a half-answered run could read as complete | Per-chunk state is tracked and displayed; a partial result is labelled partial and its `Measure` is `isPartial` |
| Four documentation items could not be confirmed from official sources | Slice 0's capability probe answers all four against the live instance. Evidence, not inference — the standard this feature holds everything else to |
| **Adoption — the real risk.** Thirty-three unused surfaces is the outcome to avoid repeating | Aging WIP lands in a meeting people already attend; the Delivery Evidence export is the primary user's own artifact for his own director; deterministic fixes need no prompt authoring. If two weeks pass and nobody has run it unprompted, stop building and go watch someone use it |
