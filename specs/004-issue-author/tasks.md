# Tasks: Issue Author

**Input**: Design documents from `specs/004-issue-author/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md),
[contracts/authoring.md](contracts/authoring.md), [research.md](research.md)

**Tests**: Required. Article V is not negotiable at any layer, and the failing test is written
first. Every test task below precedes the implementation it constrains.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: may run in parallel — different files, no dependency on incomplete work
- **[US1]–[US4]**: the user story the task serves
- Every task names the file it touches

## Path Conventions

npm workspaces. Engine in `packages/core/src/`, server in `packages/server/`, surfaces in
`packages/client/src/`. Tests sit in each package's `test/` directory.

---

## Phase 1: Setup

- [ ] T001 Create `packages/core/src/authoring/` and export its public surface from `packages/core/src/index.ts`
- [ ] T002 [P] Add the section template to the workspace document's shape in `packages/core/src/workspace/workspaceConfig.ts`, seeded with the nine sections (FR-019, FR-020)
- [ ] T003 [P] Assert in `packages/core/test/fingerprint.test.ts` that editing the section template does **not** change the workspace fingerprint. The fingerprint exists so two people disputing a number compare eight characters; a reworded section heading changes no number, and folding it in would invalidate comparison of unrelated figures

---

## Phase 2: Foundational (blocks every story)

**These carry the guarantees the rest of the feature rests on. Nothing else starts until they pass.**

- [ ] T004 Write failing tests for the draft shape in `packages/core/test/authoringDraft.test.ts`: a draft with an existing issue key is a different kind of thing from one without, and the operator's narrative has no field id to be written to (FR-007, FR-010)
- [ ] T005 Implement the draft in `packages/core/src/authoring/draft.ts` — including `loadedFieldValues`, which exists solely so a save can tell a genuine change from an untouched field
- [ ] T006 [P] Write failing tests for the create screen shape in `packages/core/test/createScreenShape.test.ts`: an empty field list and a failed read are **different states** and must not render alike
- [ ] T007 Implement `packages/core/src/authoring/createScreenShape.ts` — required flags and allowed values preserved; failure returns unavailable with a reason, never an empty list
- [ ] T008 [P] Write failing tests for the section template in `packages/core/test/sectionTemplate.test.ts`: an empty template is valid and means no imposed structure (FR-022)
- [ ] T009 Implement `packages/core/src/authoring/sectionTemplate.ts` — reads the configured list; no section list exists anywhere in source (FR-019)
- [ ] T010 Add the two createmeta routes (FR-016, FR-017) to `packages/core/src/jira/dataCenterAdapter.ts`
- [ ] T011 Write failing tests for those routes in `packages/core/test/dataCenterAdapter.test.ts`, using recorded fixtures per the Article V amendment

**Checkpoint**: the engine can describe what a create screen offers, and hold a draft.

---

## Phase 3: User Story 1 — Write a new issue from scattered material (P1) 🎯 MVP

**Goal**: paste material, write a draft, choose a project and type, create a real issue.

**Independent test**: two sources, a narrative, project and type chosen, one assistant round trip,
one correctly-typed issue in Jira (SC-001).

### Tests

- [ ] T012 [P] [US1] Failing tests for sources in `packages/core/test/authoringDraft.test.ts`: a source has no field id and cannot produce a change (FR-005)
- [ ] T013 [P] [US1] Failing tests for the change set in `packages/core/test/buildAuthoringChangeSet.test.ts`: a draft with no issue key yields exactly one create carrying every non-empty field
- [ ] T014 [P] [US1] Failing tests for the five blockers in the same file — any one makes the whole set unappliable, so a partial write cannot happen (FR-035)
- [ ] T015 [P] [US1] Failing test asserting the narrative never appears in a change set (invariant 6)
- [ ] T016 [P] [US1] Failing server tests in `packages/server/test/authoringDraft.test.js`: a stored draft survives, an absent one is a normal first state rather than an error (FR-008, SC-006)

### Implementation

- [ ] T017 [US1] Implement `packages/core/src/authoring/buildAuthoringChangeSet.ts`, reusing the shipped `ChangeSet` so the existing diff renders it unchanged
- [ ] T018 [US1] Implement `packages/server/services/draftStore.js` — the profile directory, beside the workspace document
- [ ] T019 [US1] Implement `packages/server/routes/authoringDraft.js` — GET, PUT, DELETE
- [ ] T020 [US1] Register the route in `packages/server/app.js`
- [ ] T021 [P] [US1] Build `packages/client/src/components/authoring/SourcesPanel.tsx` — paste with a label (FR-001), one text file (FR-002), each shown with its label and content (FR-003), remove (FR-004); nothing here can cause a write (FR-005)
- [ ] T022 [P] [US1] Build `packages/client/src/components/authoring/DraftPanel.tsx` — summary, description, criteria, own words (FR-006)
- [ ] T023 [US1] Build `packages/client/src/components/authoring/CreateTargetPanel.tsx` — project and type from the instance, required fields marked (FR-015 – FR-018)
- [ ] T024 [US1] Build `packages/client/src/views/AuthorView.tsx` — two columns, no wizard
- [ ] T025 [US1] Add the Author surface to the shell in `packages/client/src/App.tsx`, with its own icon in `packages/client/src/components/SurfaceIcons.tsx`
- [ ] T026 [US1] Wire create through the existing apply pipeline, so the was-to-will-be diff appears before any request (FR-037)
- [ ] T027 [P] [US1] Component tests in `packages/client/test/AuthorView.test.tsx`: the screen states which action it will take, in plain words, at all times (FR-011, SC-007)

**Checkpoint** — slice 3 of the plan. A real issue, created from a hand-written draft, diff first.
**This is the first thing worth demonstrating.**

---

## Phase 4: User Story 2 — Enrich without creating a duplicate (P1)

**Goal**: load a stub, add what it was missing, save. No second issue, and no silent rewrite.

**Independent test**: load, change one field, save; that issue updated, none created, untouched
fields not written.

### Tests

- [ ] T028 [US2] **The invariant that carries this story**, in `packages/core/test/buildAuthoringChangeSet.test.ts`: a draft with an existing issue key yields **no create, for every input** (FR-014, SC-002). Property-style over generated drafts, not one example (invariant 1)
- [ ] T029 [P] [US2] Failing test: a change set contains no field whose proposed value equals its loaded value (FR-013, invariant 2)
- [ ] T030 [P] [US2] Failing test: a description the operator never edited produces no change **even after the reply normaliser has run over it** — this is the failure with no symptom
- [ ] T031 [P] [US2] Failing test: "nothing has changed" is a blocker, not a silent no-op

### Implementation

- [ ] T032 [US2] Extend `buildAuthoringChangeSet.ts` for the update path — one planned change per genuinely differing field
- [ ] T033 [US2] Load an existing issue into the draft, capturing `loadedFieldValues` once and never again (FR-012)
- [ ] T033a [US2] Read the create screen shape for the **loaded issue's own project and type**, not a chosen one (FR-017). Moving an issue between projects or types is not this feature, and leaving this unstated would let two implementations disagree
- [ ] T034 [US2] Handle a key that does not exist or cannot be seen: say so and stay in create mode, rather than offering to update nothing
- [ ] T035 [US2] State the action in plain words wherever the key can be edited

**Checkpoint** — slice 4. **The one that must not be wrong.**

---

## Phase 5: User Story 3 — See what will be written (P2)

**Goal**: every changing field, old value beside new, before anything is sent.

### Tests

- [ ] T036 [P] [US3] Failing test: no field is written that did not appear in the diff (SC-003)
- [ ] T037 [P] [US3] Failing test: one rejected field does not prevent the others, and reports Jira's own reason verbatim (FR-038, FR-039)
- [ ] T038 [P] [US3] Failing test: a failure to reach Jira reads as our own inability, never as a refusal by Jira (FR-041)

### Implementation

- [ ] T039 [US3] Render the change set through the existing diff component — no new diff
- [ ] T040 [US3] Report per-field outcomes, and confirm every write reaches the journal already in the product (FR-040)
- [ ] T041 [US3] Discard the draft **only** on full success, so a failed write never loses the work (FR-008)

---

## Phase 6: The assistant round trip (P1 — completes US1)

**Deliberately after the create path.** The screen is worth using before an assistant is involved,
and building it this way order proves that.

### Tests

- [ ] T042 [P] [US1] Failing tests in `packages/core/test/authoringPack.test.ts`: every field identifier in a generated prompt appears in the create screen shape (invariant 3)
- [ ] T043 [P] [US1] Failing test: a reply whose pack identifier does not match is rejected whole (FR-026)
- [ ] T044 [P] [US1] Failing test: an unknown field id is dropped **and named**, never silently ignored (FR-027, SC-004)
- [ ] T045 [P] [US1] Failing test: a value outside a field's allowed values becomes null and is named (FR-028, SC-004)
- [ ] T046 [P] [US1] Failing test: unreadable content is counted and shown (FR-029)
- [ ] T047 [P] [US1] Failing tests in `packages/core/test/normaliseDescription.test.ts`: every configured section present and in order; absent ones marked as needing validation; **running it twice adds nothing** (FR-031, invariant 7)
- [ ] T048 [P] [US1] Failing test: claims of assistant authorship are removed (FR-032)

### Implementation

- [ ] T049 [US1] Implement `packages/core/src/authoring/normaliseDescription.ts` — idempotent, sections from configuration
- [ ] T050 [US1] Implement `packages/core/src/authoring/authoringPack.ts` — one schema generates the required reply shape and the parser, so they cannot drift (FR-023, FR-024)
- [ ] T050a [P] [US1] Failing tests in `packages/core/test/chunkAuthoringPrompt.test.ts`: the draft, narrative, template and field list repeat as the head of every part; a source too large for one part is truncated **and said to be truncated** (invariant 8)
- [ ] T050b [US1] Implement `packages/core/src/authoring/chunkAuthoringPrompt.ts`, dividing on **source** boundaries. The shipped `buildPromptChunks` divides an issue set on issue boundaries and cannot be reused — an authoring prompt has no issues
- [ ] T051 [US1] Render the parts through the existing pack panel, reusing its per-part return tracking (FR-025)
- [ ] T052 [US1] Land accepted proposals in the draft; nothing reaches Jira until the operator presses create or save (FR-030)

---

## Phase 7: User Story 4 — Template as configuration (P3)

- [ ] T053 [P] [US4] Failing test: an edited section list changes the next prompt (FR-021, SC-005)
- [ ] T054 [P] [US4] Failing test: an empty list yields a prompt with no imposed structure (FR-022)
- [ ] T055 [US4] Build the template editor in `packages/client/src/views/SetupView.tsx` — add, remove, reorder, edit guidance (FR-021)
- [ ] T056 [US4] Confirm a template change alters the fingerprint, and that the change needs no restart

---

## Phase 8: Polish

- [ ] T057 [P] Structural test in `packages/core/test/structuralRules.test.ts`: no `customfield_` literal in authoring source outside the field map (invariant 4)
- [ ] T058 [P] Type-level test: a readiness finding cannot be constructed where a blocking condition is required (invariant 5)
- [ ] T058a [P] Failing tests in `packages/core/test/projectDraftAsIssue.test.ts`: an unfilled field projects as **absent**, not empty, so a check reports it as it would on a real issue; when enriching, the projection starts from the loaded issue (invariant 9)
- [ ] T058b [P] Implement `packages/core/src/authoring/projectDraftAsIssue.ts`. The alternative — reimplementing every check for drafts — is how the predecessor acquired five live divergences between two rule engines
- [ ] T059 [P] Implement `packages/core/src/authoring/assessDraftReadiness.ts` over the projection, using the shipped checks, returning a type that is **not** `ChangeBlocker` (FR-033, FR-034)
- [ ] T060 [P] Build `packages/client/src/components/authoring/ReadinessPanel.tsx` — visibly not a blocker (FR-036, SC-008)
- [ ] T061 Update `CHANGELOG.md`
- [ ] T062 **Outstanding — needs the live instance.** Walk [quickstart.md](quickstart.md) against the real Jira, including scenario 2 step 6, which compares a stored description byte for byte. Nobody can complete this without the operator's own Jira.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → everything else
- **US1 (3)** depends only on Foundational. It is the MVP and can ship alone.
- **US2 (4)** depends on US1's change set existing
- **US3 (5)** depends on US1's change set existing; independent of US2
- **Phase 6** completes US1's assistant path; independent of US2 and US3
- **US4 (7)** depends on Setup T002 only, and can be built at any point after it
- **Polish (8)** last, except T057/T058 which can land early as ratchets

### Parallel opportunities

- T002 and T003 together
- T006 and T008 together
- T012–T016 all together (five failing tests, five files)
- T021 and T022 together (two panels, two files)
- T042–T048 all together (seven failing tests, two files)
- T053, T054, T057, T058, T058a together

### Suggested MVP

**Phases 1–3 only.** That is slice 3 of the plan: paste material, write a draft, create a real
issue, diff first — with no assistant and no enrichment. If creating one issue that way is not worth
doing twice, the remaining phases are not worth building.

---

## Task count

67 tasks. 34 tests, 29 implementation, 3 setup, 1 outstanding against the live instance.

Five tasks were added by the analysis pass: a source-boundary chunker and its test (the shipped
chunker divides an issue set on issue boundaries and cannot be reused), a draft-to-issue projection
and its test (the shipped checks consume an issue), and reading the create screen shape from the
loaded issue's own project and type when enriching. T003 was inverted: it now asserts the section
template does **not** enter the workspace fingerprint.
