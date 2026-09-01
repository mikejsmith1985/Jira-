# Changelog — Jira+

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Jira+ works.** Paste a JQL query and every matching issue is retrieved once, with its full
  change history, and frozen. Every other surface is a lens over that one snapshot: the flow
  charts, the quality checks, the prompts pasted into Copilot. No lens goes back and asks Jira a
  second question, which is the single restriction that makes the predecessor&#39;s defining defect
  unreachable &mdash; a query naming a field that does not exist cannot quietly become a green
  score, because there is no second query left to go wrong.
  Five surfaces: a **query console** that hands back the exact query it ran; **flow measures**
  under two definitions of finished, each emitting the Jira query that reproduces it; **hygiene
  checks** reading N of M that say so when they cannot run; a **change log** of everything the tool
  ever wrote; and a **setup screen** that confirms which Jira field is which by showing a real
  value from an issue the user names.
  239 tests. One credential: a Jira personal access token.
- **Specification for feature 001, the Issue Set engine and trust architecture.** Jira+ layers over
  Jira with API access only &mdash; no AI keys, no browser extension, no Jira plugin, no project
  admin rights. One query produces one frozen, provenance-stamped set of issues, and every result in
  the product is derived from that one set rather than from a query of its own. The specification's
  organising rule is that no quantity may be shown without the population it was measured against,
  and that a result whose data could not be obtained cannot be presented as passing &mdash; which is
  what makes the predecessor's most damaging behaviour, an unresolvable field rendering as a perfect
  score, impossible rather than merely unlikely. Covers retrieval and provenance, the measurement
  contract, quality checks declared once, field mapping confirmed against the user's own data,
  installation-wide configuration with a visible fingerprint, the copy-and-paste assistant round trip
  with validated replies, reviewed per-item writes with a change log, and sprint-free Kanban flow
  measures with an exportable delivery evidence document.
  `specs/001-issue-set-engine/spec.md`. The board-native roll-up (002) and cross-project clone
  families (003) are explicitly out of scope.
- **Four clarifications resolved against feature 001, two of which changed its shape.** The assistant
  is Microsoft Copilot in a browser, reached only by copy and paste, with an input box of roughly
  18,000 characters &mdash; so dividing a prompt is the normal case, and the specification now demands
  a visible part count before starting and per-part return tracking, because a half-answered run must
  never read as a complete one. And **completion became two lenses instead of one**: delivered to
  integration test, which is the team's Definition of Done and the lens their Programme Increment
  commitments are judged by, and released to production, which reconciles exactly with a report run
  in Jira untouched. Each lens supplies the query that reproduces it, and an assertion prevents the
  two ever telling contradictory stories &mdash; so the number that is easy to verify and the number
  that reflects what the team controls can both be shown, and neither has to be taken on trust.
  Separately, the configuration story was internally contradictory &mdash; it claimed a single copy
  while each person runs their own &mdash; and now says what is true: one record per installation,
  shared by whole-file import, with a fingerprint that lets two people find out they were configured
  differently before they argue about a number.
- **Implementation plan and design artifacts for feature 001.** Three npm workspaces, and the
  load-bearing decision is that `packages/core` compiles for both the browser and Node from one
  source. The predecessor's most damaging structural defect was a hand-written server port of its
  client rules, guarded by a parity test that compared identifiers and severities but never logic; it
  carried five divergences at once, so the emailed digest and the interactive screen could disagree
  about the same issues, and did. One compiled engine makes that impossible rather than tested for.
  Phase 0 research reversed an assumption worth recording: Jira Data Center returns **complete,
  uncapped** change history on a search &mdash; Cloud truncates at 100, Data Center does not &mdash; so
  the flow measures have their data from the first retrieval at no extra cost. The risk turned out to
  be the opposite one: Jira **silently clamps** a page-size request above its configured maximum
  rather than rejecting it, which is the same shape of quiet narrowing this feature exists to
  eliminate, one layer down. Paging therefore follows Jira's own reported total and never treats a
  short page as the end. `specs/001-issue-set-engine/{plan,research,data-model,quickstart}.md` and
  five contracts. One deviation from Article V is recorded rather than taken quietly: integration
  tests use fixtures recorded from the real instance instead of testcontainers, because Jira is
  external and a generic container would pass while the tool remained wrong about the only instance
  that matters.
- **Task breakdown for feature 001** &mdash; 131 tasks across eight phases, ordered so each one ends
  with something demonstrable. `specs/001-issue-set-engine/tasks.md`. Three groups of tests are the
  actual deliverable rather than scaffolding: the six `measure()` invariants, the assertion that
  per-person attribution sums to exactly one issue, and the structural checks that no rule names a raw
  Jira field id and no check issues a query of its own.

### Changed
- **Article V of the constitution now says why real infrastructure matters, and is therefore stricter
  where it counts.** It previously required testcontainers for all integration tests, which cannot be
  satisfied against a corporate Jira this project neither owns nor hosts. Weakening the rule was the
  wrong fix; the rule was simply written for one case and applied to two. It now separates
  infrastructure the project **runs** &mdash; where testcontainers remain mandatory and a mocked driver
  is still forbidden &mdash; from a third-party system it does **not** own, where fixtures recorded
  from the real instance are required and **a generic vendor container is explicitly rejected**,
  because it reproduces the vendor's defaults rather than the instance's real field identifiers,
  status names and limits, and would pass while the software stayed wrong about the only deployment
  that matters. Recordings must be dated, attributed to their source instance, and produced by a
  committed script anyone can re-run. The UX layer is likewise scoped to features with genuine browser
  interaction, so restating a pure state-render assertion in a browser is no longer implied. A closing
  clause makes deviations explicit: they are recorded with their rejected alternative and accepted
  before implementation, because silence is not acceptance.
  Feature 001 now passes Article V as written, with no outstanding deviation.

### Fixed
- **Six consistency defects found by a cross-artifact analysis, before any code was written.** A
  constants task sat *after* the modules that consume it; the measurement module was filed under two
  different directories in two documents; and four behaviours specified in the contracts had no task
  to build them &mdash; proof that no write escapes the change log, a test for an expired credential,
  the handling of a configuration older than the rules that read it, and the case of work reaching
  production without ever passing integration test. Rate-limit handling also moved out of the polish
  phase to sit beside the code it guards.

- Forge Workflow initialized with Forge Terminal Workflow Architect

### Changed

### Fixed

### Removed
