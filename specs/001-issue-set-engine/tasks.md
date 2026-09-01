# Tasks: Issue Set Engine and Trust Architecture

**Input**: Design documents from `/specs/001-issue-set-engine/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Required.** Constitution Article V mandates Red → Green → Refactor, so every
implementation task is preceded by a failing test. Unit tests are fully mocked and run under 10ms.

**Organization**: Grouped by user story so each is independently implementable, testable, and
demonstrable. Every story ends with something you can put in front of somebody.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on incomplete work
- **[Story]**: US1–US5, matching the user stories in spec.md

## Path Conventions

Three npm workspaces per plan.md: `packages/core` (rules, runs in browser **and** Node),
`packages/server` (Express, credential injection), `packages/client` (React).

---

## Phase 1: Setup

**Purpose**: A repository that builds, lints and tests, with nothing in it yet.

- [X] T001 Create the three workspace directories `packages/core/src`, `packages/server`, `packages/client/src` per plan.md
- [X] T002 Create root `package.json` declaring npm workspaces `packages/*` with scripts `dev`, `build`, `test`, `test:contract`, `lint`
- [X] T003 [P] Create `packages/core/package.json` and `packages/core/tsconfig.json` targeting both browser and Node, with no DOM lib
- [X] T004 [P] Create `packages/server/package.json` with `express` and `compression` as runtime dependencies
- [X] T005 [P] Create `packages/client/package.json` and `vite.config.ts` with React, Zustand, TanStack Query, Recharts
- [X] T006 [P] Configure Vitest in `vitest.config.ts` with the `packages/core/test` and `packages/server/test` projects
- [X] T007 [P] Configure ESLint in `eslint.config.js` enforcing Article IV naming — boolean `is`/`has`/`can`/`should`/`was` prefixes, no single-letter identifiers outside loop counters
- [X] T008 [P] Add `.gitignore` and `.env.example` documenting `JIRA_BASE_URL`, `JIRA_PAT`, `TBX_SSL_VERIFY`

**Checkpoint**: `npm install && npm test && npm run lint && npm run build` all succeed on an empty tree.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The engine spine. Every user story depends on all of it.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### The server, lifted and stripped

- [X] T009 Port the credential-injecting proxy from NodeToolbox `src/routes/proxy.js` into `packages/server/routes/jiraProxy.js`, keeping only the Jira branch and deleting the ServiceNow and GitHub branches
- [X] T010 [P] Port `src/config/loader.js` into `packages/server/config/loader.js`, reduced to Jira base URL, personal access token and `sslVerify`, stored under the user profile directory
- [X] T011 [P] Port `src/utils/httpClient.js` into `packages/server/utils/httpClient.js`, retaining corporate TLS-inspection tolerance
- [X] T012 [P] Port `src/services/jiraWriteJournal.js` into `packages/server/services/writeJournal.js`, append-only and capped, with request bodies excluded
- [X] T013 Create `packages/server/server.js` mounting the proxy, serving the built client, and exposing `GET /api/health`
- [X] T014 [P] Write failing test `packages/server/test/proxy.test.js` asserting the token is injected server-side and never appears in any response body
- [X] T014A Write failing test `packages/server/test/journalCoverage.test.js` asserting every mutating request reaching Jira is recorded — enumerate the proxy's write verbs and assert a journal entry for each, so SC-010's "no unlogged writes" is proved rather than assumed
- [ ] T014B [P] Create the fixture recording script `packages/server/test/fixtures/record.js`, committed and re-runnable, stamping each capture with its date and source instance per Article V

### Core model

- [X] T015 [P] Write failing test `packages/core/test/detailedIssue.test.ts` asserting `changelog: null` and `changelog: []` are distinguishable
- [X] T016 [P] Define `DetailedIssue` and `ChangelogEntry` in `packages/core/src/model/detailedIssue.ts` per data-model.md §1
- [X] T017 [P] Write failing test `packages/core/test/retrievalRecord.test.ts` asserting `isTruncated` is derived and cannot be assigned, and that a failure implies zero issues
- [X] T018 [P] Define `RetrievalRecord`, `RetrievalFailure` and `IssueSet` in `packages/core/src/model/issueSet.ts` per data-model.md §2

### The measurement contract — the feature's spine

- [X] T019 Write failing test `packages/core/test/measure.test.ts` covering all six constructor invariants from contracts/measurement-and-checks.md §1, especially that an empty population returns `not-applicable` and never `measured`
- [X] T020 Implement `Measure`, `EvaluabilityBlocker`, `MeasureProvenance` and the `measure()` constructor in `packages/core/src/measure/measure.ts`, with no publicly constructible variant and no `count` field
- [X] T021 [P] Write failing test `packages/core/test/measureInvariants.test.ts` asserting `flaggedKeys ⊆ eligibleKeys ⊆ issueSet.byKey` across generated fixtures

### The Jira adapter and the capability probe

- [X] T022 [P] Define the `JiraAdapter` interface and `CapabilityProbe` type in `packages/core/src/jira/jiraAdapter.ts` per contracts/retrieval.md §1
- [X] T023 Write failing test `packages/core/test/dataCenterAdapter.test.ts` asserting `Bearer` authorisation, that `expand` always includes `names`, and that omitting `fields` is rejected
- [X] T024 Implement `packages/core/src/jira/dataCenterAdapter.ts` against `/rest/api/2` with offset pagination per research.md R2
- [X] T025 Implement `probeCapabilities` in `packages/core/src/jira/probeCapabilities.ts`, reporting Jira version, whether search returns changelog, the observed page-size cap, and field-catalogue readability
- [X] T026 Create `packages/core/src/jira/cloudAdapter.ts` as a declared stub that throws, so the Cloud seam exists as a file rather than a future refactor

### Workspace configuration and fingerprint

- [X] T027 [P] Write failing test `packages/core/test/fingerprint.test.ts` asserting `updatedAtIso` and `updatedBy` do not affect the fingerprint, and that identical significant content yields an identical value
- [X] T028 [P] Implement `WorkspaceConfiguration` and `computeFingerprint` in `packages/core/src/workspace/workspaceConfig.ts` per data-model.md §8
- [X] T029 Implement `GET/PUT /api/workspace` in `packages/server/routes/workspace.js`, persisting one JSON document outside the browser
- [X] T030 [P] Write failing test `packages/server/test/workspace.test.js` asserting a `PUT` returns the recomputed fingerprint
- [X] T030A Implement schema-version handling in `packages/core/src/workspace/workspaceConfig.ts` so a stored configuration older than the application's own version is reported as needing review and is never reinterpreted silently under the newer rules

### Client shell

- [X] T031 Create `packages/client/src/main.tsx` and `App.tsx` with routing for Query, Flow, Hygiene, Setup and Change Log
- [X] T032 [P] Create the design tokens and base stylesheet in `packages/client/src/styles/tokens.css`, defining both themes at token level
- [X] T033 Implement `packages/client/src/components/ProvenanceBanner.tsx` rendering a `RetrievalRecord` — the receipt strip that appears on every surface
- [X] T034 Write failing test `packages/client/test/measurementTile.test.tsx` asserting the component rejects a bare number and renders three visually distinct states
- [X] T035 Implement `packages/client/src/components/MeasurementTile.tsx` and `WhyThisNumber.tsx`, accepting `Measure` and nothing else
- [X] T035A Define the retrieval ceiling, page size and transfer budget as named, configurable constants in `packages/core/src/workspace/defaults.ts` — placed here, before the modules that consume them, and never as literals per Article IV

**Checkpoint**: The engine's guarantees hold in isolation. A number cannot be constructed without its
population, and cannot be rendered without its provenance.

---

## Phase 3: User Story 1 — Ask anything about any set of tickets (P1) 🎯 MVP

**Goal**: Paste a JQL query, retrieve every matching issue in full, and complete a Copilot round trip
that writes nothing.

**Independent Test**: Paste a real query, complete a full round trip, read back a validated answer —
with no field mapping configured, no board selected, and no write permission exercised.

### Tests first ⚠️

- [X] T036 [P] [US1] Write failing test `packages/core/test/searchIssuesByJql.test.ts` asserting a non-2xx maps to a typed `RetrievalFailure` preserving Jira's `errorMessages` verbatim
- [X] T036A [P] [US1] Write failing test `packages/core/test/retrievalFailureKinds.test.ts` covering all four failure kinds distinctly — a bad field reference, an **expired or invalid credential**, a permission-restricted project, and a transport fault — so SC-004's five induced conditions are each proved to yield no passing result
- [X] T037 [P] [US1] Write failing test `packages/core/test/paging.test.ts` asserting a page shorter than requested does **not** end a retrieval, per research.md R3 — the silent clamp case
- [X] T038 [P] [US1] Write failing test `packages/core/test/fetchIssueSet.test.ts` asserting `failure !== null` implies zero issues and `state === 'failed'`
- [X] T039 [P] [US1] Write failing test `packages/core/test/buildPromptChunks.test.ts` asserting division never occurs within an issue and each chunk carries its own whitelist
- [X] T040 [P] [US1] Write failing test `packages/core/test/packReply.test.ts` covering every rung of the validation ladder in contracts/prompt-packs.md §4
- [X] T041 [P] [US1] Write failing integration test `packages/server/test/retrieval.contract.test.js` against recorded fixtures for the clamp, a 400 on an unknown field, and a truncated retrieval

### Retrieval

- [X] T042 [US1] Implement `searchIssuesByJql` in `packages/core/src/jira/searchIssuesByJql.ts` with an explicit field list mandatory and `expand=names` always present
- [X] T043 [US1] Port `fetchIssuesPaged` from NodeToolbox `client/src/services/fetchIssuesPaged.ts` into `packages/core/src/jira/fetchIssuesPaged.ts`, hardened so paging follows Jira's reported total rather than page length
- [X] T044 [US1] Implement `fetchIssueSet` in `packages/core/src/jira/fetchIssueSet.ts`, unioning mapped concept field ids into the request and freezing the result
- [X] T045 [US1] Implement the per-issue changelog fallback in `fetchIssueSet` at concurrency 6, setting `changelogCoverage` honestly
- [X] T046 [P] [US1] Port `escapeJqlValue` from NodeToolbox `client/src/utils/jqlValue.ts` into `packages/core/src/jira/jqlValue.ts`

### The pack runtime

- [X] T047 [P] [US1] Port `extractJsonPayload` from NodeToolbox `client/src/utils/extractJsonPayload.ts` into `packages/core/src/packs/extractJsonPayload.ts` verbatim
- [X] T048 [US1] Define `PromptPack`, `PackItemSchema` and `PackFieldSpec` in `packages/core/src/packs/promptPack.ts`
- [X] T049 [US1] Implement `buildPromptChunks` in `packages/core/src/packs/buildPromptChunks.ts`, rendering absent values as `(none in Jira)` and reporting untransferable issues rather than splitting them
- [X] T050 [US1] Implement `parsePackReply` in `packages/core/src/packs/parsePackReply.ts` with the pack-id guard, whitelist drop, tri-state booleans and honest unparsed counts
- [X] T051 [US1] Generate the required-shape prompt section from `itemSchema` in `packages/core/src/packs/renderItemSchema.ts`, so prompt and parser cannot drift
- [X] T052 [P] [US1] Define the `ask-anything` pack in `packages/core/src/packs/definitions/askAnything.ts`, which produces no proposals

### The console

- [X] T053 [US1] Implement `packages/client/src/views/QueryConsole/QueryConsoleView.tsx` with the query field, the provenance banner and the results table
- [X] T054 [US1] Implement the four failure presentations in `packages/client/src/views/QueryConsole/RetrievalFailureNotice.tsx`, each naming its own next action
- [X] T055 [US1] Implement `packages/client/src/components/PackPanel.tsx` with per-chunk state, copy buttons and the honest reject ledger
- [X] T056 [US1] Wire retrieval through TanStack Query in `packages/client/src/state/useIssueSet.ts`, with no hand-rolled fetch lifecycle
- [X] T057 [US1] Write failing test `packages/core/test/rateLimit.test.ts` asserting a 429 maps to a `transport` failure carrying `Retry-After`, and — critically — that a throttled page mid-retrieval is never mistaken for the end of the results, then make it pass in `searchIssuesByJql`

**Checkpoint**: Quickstart scenarios 1 and 2 pass. Paste real JQL, see the receipt, complete a Copilot
round trip. A made-up field is red with Jira's words and no number appears.

---

## Phase 4: User Story 2 — Prove the team delivers (P2)

**Goal**: Sprint-free flow measures under two completion lenses, each emitting the Jira query that
reproduces it, exportable as one document a sceptic can check.

**Independent Test**: Point it at six months of the team's real work and produce an export whose
weekly completion count is reproducible by running the stated query in Jira.

### Tests first ⚠️

- [X] T058 [P] [US2] Write failing test `packages/core/test/issueTimeline.test.ts` asserting `isReconstructable` is false when changelog is null, and that such issues are excluded and counted
- [X] T059 [P] [US2] Write failing test `packages/core/test/attribution.test.ts` asserting holder shares sum to 1.0 ± 1e-9 per issue and per-person totals sum to the team total
- [X] T060 [P] [US2] Write failing test `packages/core/test/lensContainment.test.ts` asserting released-to-prod ⊆ delivered-to-int for every period
- [X] T061 [P] [US2] Write failing test `packages/core/test/verifyingJql.test.ts` asserting each lens emits `status CHANGED TO … DURING` against recorded fixtures matching the computed set exactly

### The flow engine

- [X] T062 [P] [US2] Port `issueTimeline.ts` from NodeToolbox `client/src/views/ReportsHub/issueTimeline.ts` into `packages/core/src/flow/issueTimeline.ts`, keeping `buildStateSegments` and `businessMillisBetween` unmodified
- [X] T063 [P] [US2] Port `issueFlow.ts` from NodeToolbox into `packages/core/src/flow/issueFlow.ts`, retaining the explicit unassigned holder
- [X] T064 [P] [US2] Port `workingDays.ts` from NodeToolbox `client/src/utils/workingDays.ts` into `packages/core/src/flow/workingDays.ts` with its injectable calendar
- [X] T065 [US2] Implement `CompletionLens`, `findCompletionMs`, `findStartMs` and `buildVerifyingJql` in `packages/core/src/flow/completionLens.ts`, including the three stated conventions — completion is the most recent qualifying entry so a regression cannot inflate a period, start is the first entry ever, and an item that reached production without ever passing integration test is **reported as an exception under the stricter lens rather than omitted from it**
- [X] T066 [US2] Implement `allocateHolderCredit` in `packages/core/src/flow/attribution.ts` with the sums-to-one runtime assertion in development builds
- [X] T067 [P] [US2] Implement `throughput.ts` in `packages/core/src/flow/`, counting distinct issues per ISO week with a rolling mean and a work-mix split
- [X] T068 [P] [US2] Implement `cycleTime.ts` in `packages/core/src/flow/` with 50th, 85th and 95th percentiles
- [ ] T069 [P] [US2] Implement `cumulativeFlow.ts` in `packages/core/src/flow/`, reconstructing daily status occupancy
- [X] T070 [P] [US2] Implement `agingWip.ts` in `packages/core/src/flow/`, plotting unfinished work against the percentile bands
- [X] T071 [P] [US2] Implement `flowEfficiency.ts` in `packages/core/src/flow/`, active over active-plus-waiting

### The surface

- [X] T072 [US2] Implement `packages/client/src/views/Flow/FlowView.tsx` with the lens switch recomputing all six measures together
- [X] T073 [US2] Implement `packages/client/src/views/Flow/LensDefinitionLine.tsx` stating the conditions in force above every chart
- [X] T074 [P] [US2] Implement the six Recharts charts in `packages/client/src/views/Flow/charts/`, each with hover and drill-through to the exact issue keys
- [X] T075 [US2] Implement `packages/client/src/views/Flow/HowDoICheckThis.tsx` handing the user the verifying query for the current lens and period
- [X] T076 [US2] Implement `buildDeliveryEvidence` in `packages/core/src/flow/deliveryEvidence.ts` per contracts/flow-measures.md §6
- [X] T077 [US2] Implement the export in `packages/client/src/views/Flow/DeliveryEvidenceExport.tsx`, carrying every issue key, the query, the counts and the fingerprint

**Checkpoint**: Quickstart scenario 3 passes. The Delivery Evidence export for the real team is
reproducible by someone who has not seen the tool.

---

## Phase 5: User Story 3 — Know exactly what the app is reading (P3)

**Goal**: Confirm every concept against a real value from a named issue, and give the configuration a
visible identity.

**Independent Test**: Configure from scratch against a live Jira, confirm each field by seeing your own
data in it, and watch the fingerprint appear in the header and on an export.

### Tests first ⚠️

- [X] T078 [P] [US3] Write failing test `packages/core/test/resolveFieldMap.test.ts` asserting exact-name matching only, that a match is proposed and never committed, and that catalogue failure yields `unresolved` rather than defaults
- [X] T079 [P] [US3] Write failing test `packages/core/test/fieldMapStates.test.ts` asserting `absent` and `unmapped` produce different measure states
- [ ] T080 [P] [US3] Write failing test `packages/core/test/workspaceImport.test.ts` asserting import replaces wholly and reproduces the exporter's fingerprint exactly

### Implementation

- [X] T081 [P] [US3] Define `ConceptId` and `FieldMapEntry` in `packages/core/src/fields/logicalFields.ts` with no default field ids anywhere
- [X] T082 [US3] Implement `resolveFieldMap` and `fetchFieldCatalogue` in `packages/core/src/fields/resolveFieldMap.ts`, capturing `clauseNames` for later drill-through
- [X] T083 [US3] Implement `readConcept` in `packages/core/src/fields/readConcept.ts` as the only path from a rule to a Jira field
- [X] T084 [US3] Implement sample-value reading in `packages/core/src/fields/readSampleValue.ts`, pulling a real value from an issue the user names
- [X] T085 [US3] Implement `packages/client/src/views/Setup/SetupView.tsx` — the connectivity step, the probe result, and the mapping confirmation
- [X] T086 [US3] Implement `packages/client/src/views/Setup/FieldMappingConfirm.tsx` showing id, Jira's own name, type and the sample value for every candidate
- [X] T087 [US3] Implement `packages/client/src/components/FingerprintBadge.tsx` in the application header
- [ ] T088 [US3] Implement export and import in `packages/server/routes/workspace.js`, with a diff and confirmation before replacement
- [X] T089 [US3] Mark results whose fingerprint no longer matches current configuration as stale in `packages/client/src/state/useWorkspace.ts`

**Checkpoint**: Quickstart scenarios 4 and 7 pass. Two installations sharing a configuration file
produce identical fingerprints and identical numbers.

---

## Phase 6: User Story 4 — Hygiene findings that survive being checked (P4)

**Goal**: Three checks reporting `N of M`, with honest gaps that can never render as a pass.

**Independent Test**: Run the checks, then unmap a field and confirm its dependent checks change to an
explicit not-measurable state — never to a passing score.

### Tests first ⚠️

- [X] T090 [P] [US4] Write failing test `packages/core/test/registryIntegrity.test.ts` asserting every exported check definition is registered and no check-id literal appears outside the registry
- [X] T091 [P] [US4] Write failing test `packages/core/test/noRawFieldIds.test.ts` asserting no `customfield_` literal exists outside `packages/core/src/fields/`
- [X] T092 [P] [US4] Write failing test `packages/core/test/noQueriesInChecks.test.ts` asserting no module under `checks/` imports from `jira/`
- [X] T093 [P] [US4] Write failing test `packages/core/test/populationIsDenominator.test.ts` asserting `eligibleKeys` equals the set satisfying `isInPopulation`
- [X] T094 [P] [US4] Write failing test `packages/core/test/runChecks.test.ts` asserting an unmapped required concept short-circuits to `unresolved` **before** evaluation runs

### Implementation

- [X] T095 [US4] Implement `defineCheck` and `CheckContext` in `packages/core/src/checks/defineCheck.ts`
- [X] T096 [US4] Implement `packages/core/src/checks/registry.ts` deriving the catalogue and the id union from the definition array
- [X] T097 [US4] Implement `runChecks` in `packages/core/src/checks/runChecks.ts` with concept resolution strictly before population partitioning
- [X] T098 [P] [US4] Define `missing-story-points` in `packages/core/src/checks/builtins/missingStoryPoints.ts`
- [X] T099 [P] [US4] Define `missing-acceptance-criteria` in `packages/core/src/checks/builtins/missingAcceptanceCriteria.ts`
- [X] T100 [P] [US4] Define `missing-fix-version` in `packages/core/src/checks/builtins/missingFixVersion.ts`, applying to every type that can carry a fix version — the FR-021B regression
- [X] T101 [US4] Implement `buildDrillThroughJql` using `clauseNames` in `packages/core/src/checks/drillThrough.ts`, never the REST field id
- [X] T102 [US4] Implement `packages/client/src/views/Hygiene/HygieneView.tsx` with the tile grid, the not-measurable section and denominator drill-through
- [X] T103 [US4] Exclude `not-applicable` and `unresolved` results from every aggregate in `packages/core/src/checks/aggregate.ts`

**Checkpoint**: Quickstart scenario 5 passes — the five-minute trust demo. Unmap a field and the tile
goes amber, not green.

---

## Phase 7: User Story 5 — Change issues safely (P5)

**Goal**: Reviewed, per-item writes with a change log, and one-click fixes needing no prompt.

**Independent Test**: Accept proposals for three issues, review the diff, apply, confirm in Jira, and
confirm all three appear in the log.

### Tests first ⚠️

- [X] T104 [P] [US5] Write failing test `packages/core/test/buildChangeSet.test.ts` asserting an unchanged value produces no planned change and that one blocker refuses the whole action
- [X] T105 [P] [US5] Write failing test `packages/core/test/runApplyPlan.test.ts` asserting per-item independence — one failure neither prevents nor undoes the others
- [X] T106 [P] [US5] Write failing test `packages/core/test/fieldWriters.test.ts` asserting fixVersion uses `update.set` and story points handles the dropdown case

### Implementation

- [X] T107 [US5] Implement `Proposal`, `PlannedChange`, `ChangeSet` and `buildChangeSet` in `packages/core/src/apply/buildChangeSet.ts` as a pure diff
- [X] T108 [US5] Port the writer set from NodeToolbox `client/src/views/SprintDashboard/featureReviewFixes.ts` into `packages/core/src/jira/write/fieldWriters.ts`
- [X] T109 [US5] Port `resolveFieldWriteRoute` from NodeToolbox `client/src/components/IssueFieldEditors/editableFieldWrite.ts` into `packages/core/src/jira/write/resolveFieldWriteRoute.ts`
- [X] T110 [US5] Implement `runApplyPlan` in `packages/core/src/apply/runApplyPlan.ts` with independent per-item outcomes and no rollback
- [X] T111 [US5] Implement `packages/client/src/components/ChangeDiffTable.tsx` rendering was-to-will-be with per-row checkboxes
- [ ] T112 [P] [US5] Define the `fix-acceptance-criteria` pack in `packages/core/src/packs/definitions/fixAcceptanceCriteria.ts`
- [ ] T113 [P] [US5] Define the `fix-thin-description` pack in `packages/core/src/packs/definitions/fixThinDescription.ts`
- [X] T114 [P] [US5] Implement the deterministic `set-missing-fix-version` fix in `packages/core/src/apply/fixes/setMissingFixVersion.ts`
- [ ] T115 [P] [US5] Implement the deterministic `align-out-of-sync-dates` fix in `packages/core/src/apply/fixes/alignOutOfSyncDates.ts`
- [X] T116 [US5] Implement `GET /api/write-journal` in `packages/server/routes/writeJournal.js`
- [X] T117 [US5] Implement `packages/client/src/views/ChangeLog/ChangeLogView.tsx`

**Checkpoint**: Quickstart scenario 6 passes. All five stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T118 [P] Define the `delivery-narrative` pack in `packages/core/src/packs/definitions/deliveryNarrative.ts`
- [ ] T119 [P] Add the untransferable-issue, duplicate-key and two-concepts-one-field edge cases to `packages/core/test/edgeCases.test.ts` — rate limiting is covered earlier by T057, beside the code it guards
- [ ] T120 [P] Verify both themes render correctly by auditing `packages/client/src/styles/tokens.css` for any colour defined only inside a media or `[data-theme]` block
- [ ] T121 [P] Add keyboard focus states and `prefers-reduced-motion` handling across `packages/client/src/components/`
- [ ] T122 Confirm every exported function carries a doc comment and every file a purpose comment, per Article IV
- [ ] T123 Confirm no function exceeds 40 lines across `packages/core/src/`, extracting helpers where it does
- [ ] T124 Run the full quickstart against the live Jira instance and record the capability probe's answers in `research.md`
- [ ] T125 Update `CHANGELOG.md` with the user-visible behaviour delivered, per Article VI
- [ ] T126 Open the pull request for `feature/issue-set-engine` per Article III

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** — no dependencies.
- **Foundational (Phase 2)** — depends on Setup. **Blocks every user story.**
- **US1 (Phase 3)** — depends on Foundational only.
- **US2 (Phase 4)** — depends on Foundational only. Independent of US1.
- **US3 (Phase 5)** — depends on Foundational only.
- **US4 (Phase 6)** — depends on Foundational; **meaningfully depends on US3**, because a check without
  a confirmed field mapping can only demonstrate the not-measurable state. Buildable in parallel,
  demonstrable only after US3.
- **US5 (Phase 7)** — depends on Foundational; its fix packs reference checks from US4.
- **Polish (Phase 8)** — depends on all desired stories.

### Within each story

Tests are written first and must fail. Then model, then engine, then surface. Article V is not
negotiable here — the invariant tests in T019, T059 and T093 are the feature's actual deliverable, and
writing them after the code would defeat their purpose.

### Parallel opportunities

- T003–T008 in Setup all run together.
- T015–T018 and T027–T028 in Foundational run together — different files, no shared dependency.
- Every test task marked `[P]` within a story runs together, before that story's implementation.
- The six flow measures T067–T071 are independent pure modules and parallelise fully.
- The three check definitions T098–T100 parallelise; the registry T096 must land first.
- With more than one developer, US1, US2 and US3 proceed in parallel once Phase 2 completes.

---

## Parallel Example: User Story 1

```bash
# All six failing tests first, together:
Task: "Write failing test packages/core/test/searchIssuesByJql.test.ts"
Task: "Write failing test packages/core/test/paging.test.ts"
Task: "Write failing test packages/core/test/fetchIssueSet.test.ts"
Task: "Write failing test packages/core/test/buildPromptChunks.test.ts"
Task: "Write failing test packages/core/test/packReply.test.ts"
Task: "Write failing test packages/server/test/retrieval.contract.test.js"

# Then the independent pure modules:
Task: "Port extractJsonPayload into packages/core/src/packs/extractJsonPayload.ts"
Task: "Port escapeJqlValue into packages/core/src/jira/jqlValue.ts"
Task: "Define the ask-anything pack in packages/core/src/packs/definitions/askAnything.ts"
```

---

## Implementation Strategy

### MVP — User Story 1 only

1. Phase 1 Setup.
2. Phase 2 Foundational — **run T025's capability probe against the real Jira before anything else in
   Phase 3**. It answers the four items research could not confirm, and it decides whether US2's
   history retrieval costs one request or three hundred.
3. Phase 3 US1.
4. **Stop and validate** against quickstart scenarios 1 and 2.
5. Demonstrate: paste a real query, ask Copilot a question, read the answer. Then break it on purpose.

### Incremental delivery

| After | Demonstrable artifact |
|---|---|
| Phase 2 | The probe's answers about the real instance |
| US1 | A working Copilot round trip over real tickets |
| US2 | The Delivery Evidence export for the real team |
| US3 | Field mapping confirmed by seeing your own data |
| US4 | **The five-minute trust demo** — unmap a field, the tile goes amber |
| US5 | Reviewed writes with a change log |

### If two weeks pass and nobody has run it unprompted

Stop building and go watch someone use it. Thirty-three unused surfaces is the outcome this feature
exists to avoid repeating, and no amount of further correctness fixes an adoption problem.

---

## Notes

- `[P]` means a different file with no dependency on incomplete work.
- Commit after each task or logical group; branch per phase per Article III.
- Every ported module carries a comment naming its NodeToolbox origin and what changed, so a later
  reader can tell a lift from a rewrite.
- The invariant tests are not scaffolding. T019, T059, T090–T094 encode the guarantees the whole
  product rests on; if one becomes inconvenient, that is a signal about the code, not the test.
