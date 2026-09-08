# Implementation Plan: Issue Author

**Branch**: `feature/issue-author` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-issue-author/spec.md`

## Summary

One screen holds the material and the draft side by side, hands both to the operator's assistant,
and then creates the issue — or updates the one named in a single field, which is what makes a
duplicate impossible rather than unlikely.

Most of this is assembly. The change set with its blocker gate and diff, the reply parser and its
rejection paths, the checks, the write journal and the tokenless relay all exist and are tested.

What is new: reading what a create screen actually offers, a draft that is not an existing issue, a
section template that lives in configuration instead of code — and **dividing a prompt on source
boundaries**, because the shipped chunker divides an issue set on issue boundaries and an authoring
prompt has no issues. That last one was found by the analysis pass, not before it.

## Technical Context

**Language/Version**: TypeScript 5.7 (engine, browser and Node), Node 20 (server), React 19 (client)
**Primary Dependencies**: none added. Express 4, Vitest 3, Testing Library — all already present.
**Storage**: the draft in the profile directory beside the workspace document; the section template
inside the workspace document itself
**Testing**: Vitest across three layers, per Article V as amended
**Target Platform**: Windows x64, packaged as one executable
**Project Type**: npm workspaces — `core` (engine), `server` (proxy), `client` (surfaces)
**Performance Goals**: a create screen shape read once per project-and-type choice, not per keystroke
**Constraints**: no assistant API; copy out and paste back within Copilot's input ceiling. No
personal access token required — the relay already provides that.
**Scale/Scope**: one operator, one draft at a time

## Constitution Check

| Article | How this feature satisfies it |
|---|---|
| **I — Prime Directive** | The template goes in configuration, which is the harder route; freezing it in a module would be faster and is what the predecessor did. |
| **III — Branching** | `feature/issue-author`, merged by pull request. |
| **IV — Code Quality** | No field-id literals anywhere; the create screen shape is the only source of what fields exist. Functions under forty lines; the 830-line predecessor component is split. |
| **V — Testing** | Red first at every layer. Engine unit tests are pure. Server route tests use the real routes over the real middleware. Recorded fixtures stand in for Jira, per the amendment. |
| **VI — Documentation** | `CHANGELOG.md` only; this `specs/` tree is the exempt pipeline artefact. |
| **VII — Framework-First** | The change set, blocker gate, diff, journal, checks and relay are reused unchanged, as is the pack schema and its parser. Three components are custom against documented gaps, each justified below: the section normaliser, the source-boundary chunker, and the draft-to-issue projection. |
| **VIII — Release** | `git tag` then `gh release create`. No Actions. |
| **IX — Vault** | No secret is involved. The relay means there may be no credential at all. |
| **X — Verification** | [quickstart.md](quickstart.md) proves behaviour against the live instance, including the two failures that have no symptom: a duplicate issue and a silently rewritten description. |
| **XI — Restraint** | No dashboard, no status document. |

**Result**: PASS. Four deviations, recorded below. Three of the four were found by the analysis
pass rather than during planning, which is what that pass is for.

## Project Structure

### Documentation (this feature)

```
specs/004-issue-author/
├── spec.md
├── plan.md              # this file
├── research.md          # the four questions, three settled by evidence
├── data-model.md        # five things, one of which decides the rest
├── quickstart.md        # how to prove it, against the real instance
├── contracts/
│   └── authoring.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
packages/core/src/
├── authoring/
│   ├── draft.ts                 # the draft, and the one field that decides create vs update
│   ├── createScreenShape.ts     # what the instance says this type offers
│   ├── sectionTemplate.ts       # the configured sections; seed values, not rules
│   ├── normaliseDescription.ts  # every section present, in order, markers where absent
│   ├── chunkAuthoringPrompt.ts  # divides on SOURCE boundaries; the shipped chunker divides on issues
│   ├── projectDraftAsIssue.ts   # so the shipped checks read a draft without being reimplemented
│   ├── authoringPack.ts         # the prompt and its parser, from one schema
│   ├── buildAuthoringChangeSet.ts
│   └── assessDraftReadiness.ts
└── jira/
    └── dataCenterAdapter.ts     # + createmeta routes

packages/server/
├── routes/authoringDraft.js     # GET / PUT / DELETE the stored draft
└── services/draftStore.js       # profile directory, beside the workspace

packages/client/src/
├── views/AuthorView.tsx         # the screen: two columns
└── components/authoring/
    ├── SourcesPanel.tsx         # gather; nothing here can cause a write
    ├── DraftPanel.tsx           # summary, description, criteria, own words
    ├── CreateTargetPanel.tsx    # project, type, and which action this is
    └── ReadinessPanel.tsx       # advisory findings, visibly not blockers
```

### Delivery slices

Each slice is demonstrable on its own and lands in that order.

| Slice | What can be shown |
|---|---|
| **1 — Gather and draft** | Paste sources, write a draft, reload the page, everything is still there. No Jira involved. |
| **2 — Know the target** | Choose a project and type; the real types and real fields appear, required ones marked. |
| **3 — Create** | Create a real issue from a hand-written draft. Diff first. No assistant yet. |
| **4 — Enrich** | Load a stub, change one field, save. Prove no duplicate and no silent rewrite. |
| **5 — The assistant** | Prompt out, reply back, proposals in the draft, four kinds of bad reply handled. |
| **6 — Template as configuration** | Edit the sections in Setup; the next prompt reflects it. |

Slice 3 is the first one worth a demonstration. Slice 4 is the one that must not be wrong.

## Complexity Tracking

| Deviation | Why | Rejected alternative |
|---|---|---|
| **A description normaliser is custom code.** Nothing in the stack re-emits headed sections in a configured order, inserting a marker where one is missing, idempotently. | Article VII requires a documented gap; this is one. The behaviour is required by FR-031, and re-running it must not accumulate markers. | A Markdown library. Rejected: the sections are configuration, not Markdown structure, and the requirement is to notice an **absent** section — a formatter has no opinion about what should have been there. |
| **The section template is excluded from the workspace fingerprint**, though it lives in the workspace document. | The fingerprint exists so two people disputing a **number** can compare eight characters. A section heading changes no number, so folding it in would invalidate comparison of unrelated figures every time somebody reworded a piece of guidance. | Including it, as first planned. Rejected: it makes the fingerprint noisier without making any number more trustworthy. The template is instead stamped on a drafted issue, where it is genuinely the thing that produced the text. |
| **A source-boundary chunker is custom code.** `buildPromptChunks` divides an issue set on issue boundaries; an authoring prompt has one draft and its sources, and no issues. | Article VII requires a documented gap. Reusing the shipped chunker is not possible — its input is an issue set — and pretending otherwise would surface as a truncated prompt at implementation time. | Rendering the whole prompt and letting the operator cut it. Rejected: a source silently halved is exactly the failure the truncation notice exists to prevent. |
| **A draft-to-issue projection is custom code.** The shipped checks consume a `DetailedIssue`; a draft is not one. | The alternative is a second implementation of every check that runs against drafts, which is precisely how the predecessor acquired five live divergences between its two rule engines. | Reimplementing the checks for drafts. Rejected outright for the reason above. |
| **The draft is stored server-side**, where the product's rule is that browser storage holds only ephemeral interface state. | The rule exists because *configuration* in browser storage made two people run different rules invisibly. A draft is work-in-progress, changes no number, and must survive the navigation the relay causes. | Browser storage. Rejected: it fails silently in a private window or with site data blocked, and the predecessor's answer to that was a permanent banner warning that work may be lost. |

## Risks

| Risk | Mitigation |
|---|---|
| **The assistant ignores the section structure.** No API, so no constraint is possible. | The normaliser produces a complete ordered description from a partial reply, with markers where content is missing. A poor reply degrades to a visible gap, not a failure. |
| **Createmeta is permitted for reading but the create is refused** — a project where the operator can browse but not create. | The create reports the instance's own refusal verbatim. Nothing is guessed, and the draft is kept so the work is not lost. |
| **A description is silently rewritten on save**, because normalising a description the operator never touched makes it differ from what was loaded. | Compare against `loadedFieldValues`, never against a normalised form. Quickstart scenario 2 step 6 checks the stored description byte for byte — this failure has no symptom otherwise. |
| **The screen grows into the predecessor's 830-line component.** | Four panels with four jobs, and the pack panel already exists. The forty-line rule applies to each. |
| **Adoption**: another surface nobody opens. | Slice 3 is a real issue created from real material in one sitting. If that is not worth doing twice, the later slices are not worth building. |
