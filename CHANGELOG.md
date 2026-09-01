# Changelog — Jira+

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Field mappings import from NodeToolbox, overwriting.** Mapping custom fields by hand is the one
  genuinely tedious step in setting this up, and it had already been done once in Toolbox. Setup now
  imports those mappings and replaces what Jira+ holds, with no confirmation gate in front of it &mdash;
  a summary afterwards says exactly what changed. That is a deliberate exception: the defect this
  product exists to remove is a *hardcoded default* silently binding a check to the wrong field, and
  a value the user configured himself is evidence of what his instance uses. Treating the two as the
  same risk just makes him re-answer his own question. A concept Toolbox never mapped is left alone
  rather than acquiring a default.
- **The running copy names itself, and can be stopped.** Jira+ starts hidden so no console window
  flashes up, and the cost was that Task Manager was the only way to tell one copy from another or
  to stop one. Setup now shows the port, process id and start time of the copy serving the page, with
  a **Stop Jira+** button; the zip carries a `Stop Jira Plus.vbs` that does the same from outside.
  The process id is not decoration &mdash; it is what remains actionable if the button ever fails.
- **Jira+ updates itself.** Downloading a zip from a website by hand is a step nobody performs
  twice, so an update nobody installs is a fix nobody receives. Setup now shows when a newer
  version has been published and fetches it on one click.
  The install order is the load-bearing part, and it follows from one Windows fact: a running
  executable cannot be overwritten. The new version is written to `versions\<new>` **beside** the
  running one, verified on disk, and only then does `current.txt` move to point at it. Interrupt it
  anywhere &mdash; dropped connection, killed process, full disk &mdash; and the previous version is
  still installed and still selected. The worst outcome is a wasted folder, never a machine that
  will not start. Versions are compared by **number**: string comparison puts `0.1.10` before
  `0.1.9` and the only symptom is that updates quietly stop being offered.
  A machine with no route to GitHub reports **"could not check"** and how to update by hand. It
  never claims to be up to date, because nothing established that.
- **Jira+ ships as a zip you extract and double-click.** This was missing, and its absence would have
  made everything else useless: the environment Jira+ is for has no guaranteed Node.js on PATH, no
  guaranteed reach to the npm registry, and no appetite for a terminal. `npm install` is not an
  install path there.
  So the artifact is one executable carrying its own Node runtime, its own dependencies and the whole
  interface inside it &mdash; 46&nbsp;MB, nothing installed, nothing fetched at run time, no
  administrator rights. `Launch Jira Plus.vbs` starts it hidden, waits for the port and opens the
  browser; `Launch Jira Plus (show errors).bat` does the same with the window left open, for the
  moment the first one does not work.
  The `versions\<version>` folder with a `current.txt` pointer exists for one reason: **Windows will
  not overwrite a running executable**. An update installs beside the current one and the pointer is
  flipped, so an update that fails halfway leaves somebody with a working application rather than a
  broken folder. Both launchers repair a missing or stale pointer by taking the highest installed
  version, comparing by version NUMBER rather than folder timestamp &mdash; a build copied later is
  not necessarily a later build.
  Settings live in `%APPDATA%\JiraPlus`, outside the application folder, so they survive an update.
  `npm run build:release` produces the zip locally, per Article VIII.
- **Work that spans four projects, in one readable lane.** QE clones the dev Feature into its own
  feature project and links stories from its own team project; BT does the same with two more; both
  run their own Scrum sprints; and there are no admin rights in any of those projects. **No Jira
  board can show that** &mdash; a shared board would need administration nobody has and projects mixed
  into one sprint board, which gets hairy fast. Jira+ is not a board, it is a view assembled from
  queries, and read-only cross-project JQL needs only Browse permission. The constraint that looked
  like the obstacle is what makes this possible.
  **The project decides, not the link.** A Cloners link can equally point at a peer Feature inside the
  dev team&#39;s own project, and treating every clone link as another discipline&#39;s copy would turn a
  colleague&#39;s Feature into a QE sub-lane. Only a clone in a project declared as a discipline becomes
  one; a clone in a project nobody claimed is reported rather than guessed at.
  Discipline work renders as **read-only rows inside the Feature lane**, collapsed by default, so the
  board looks exactly as it did without them &mdash; one readable axis rather than the two-axis
  swimlane board. Their sprints are ignored rather than reconciled, because the view is
  Feature-scoped. Where their own board cannot be read, the row falls back to Jira&#39;s universal three
  states **and says so**: forcing their work into the dev team&#39;s column names would be the same lie
  as the parallel vocabulary this design removed.
  Progress is **two figures, never blended** &mdash; dev-only beside whole-family. One number would
  leave a reader unable to say whether dev is finished and QE has not started, or the reverse, and
  those are opposite situations calling for opposite conversations.
- **The roll-up board, drawn over the real Jira board.** Feature swimlanes across the board&#39;s own
  columns &mdash; same names, same order, same status mappings &mdash; with **nothing to configure and
  no vocabulary to maintain**. The predecessor kept its own column names, order and mappings per team
  in browser storage and a Confluence property, reconciled against nothing; a full search of that
  codebase found zero calls to the endpoint this feature is built on. Its board was not a view of a
  Jira board at all.
  The reason it invented one is real: **Jira board columns can only be statuses**, and this team&#39;s
  workflow carries more than that. So a sub-status distinction becomes labelled **bands inside** the
  column it refines, where the column&#39;s own total still reconciles with Jira exactly; and an open
  code-review sub-task becomes a **badge on the card**, never a column, because inventing a column
  Jira does not have is precisely what breaks that reconciliation. A refinement can change how a
  column looks. It can never lose a card, and an assertion enforces that rather than a convention.
  Dragging a card decides what the move requires **before sending anything**, so a move Jira would
  refuse is refused with no request made and no failed write in the log for something nobody could
  have done. And when a two-part move half-succeeds, the card does **not** snap back: Jira really did
  perform the transition, and showing the card at its origin would display a state Jira does not
  hold.
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
- **A second copy no longer crashes.** `app.listen` had no error handler, so starting Jira+ while it
  was already running threw an unhandled `EADDRINUSE` and the process died &mdash; a hidden process
  crashing on every second double-click of the shortcut. The launcher then polled the port, found the
  **first** copy listening, and opened the browser, so it looked like it had worked while something
  had genuinely gone wrong. A port already in use is not a failure: it means the thing the person
  wanted is already serving. The second copy now says so and exits cleanly, and the browser opens on
  the copy that is running.
- **Jira+ no longer blames Jira for its own state.** The first person to use it hit this within a
  minute: their token was fine &mdash; the connection test returned *"Signed in as ..."* &mdash; but
  the proxy refused every request with a 503 because the connection had not been saved, and the
  screen reported *"Jira answered with status 503."* Jira never answered. Jira+ refused, having no
  address to forward to. That is this product's own thesis inverted, and it sent somebody hunting an
  outage that did not exist. An unconfigured refusal is now its own failure kind, marked by the
  proxy in a way Jira cannot imitate, so it stays distinguishable from a real Jira 503 &mdash; and it
  reads *"Jira+ has not been pointed at a Jira yet."*
- **Success no longer looks like a warning.** Only `.notice--error` was ever written, so
  `notice--pass` and `notice--attn` both fell back to the amber default: *"Signed in as Mike Smith"*
  and *"Not configured yet"* rendered identically. Two states looking the same is the single defect
  this product exists to remove, and it had been reproduced in the stylesheet.
- **Save now tests before it saves.** Test and Save were two buttons with no indication that the
  first does not imply the second, so a passing test left the address unsaved and every other screen
  failing. Save runs the same check and then commits; Test stays for checking without committing. A
  failed test does not block the save &mdash; somebody configuring while Jira is briefly down still
  has the right address.
- **Setup stops reporting an unfinished setup as a Jira failure.** The field list and sample issue
  now say *"Save the connection above first"* rather than surfacing the proxy's status code.
- **Jira+ can now be set up from its own interface.** It shipped able to READ a stored Jira
  address and token and with no way to SET one: `saveConfig` existed in the loader and nothing
  called it &mdash; no route, no screen. The result started, served its interface, and could not be
  pointed at a Jira, which from the user's side is indistinguishable from broken. Setup now opens
  with the connection: address, token, a TLS toggle for networks that re-sign traffic, and a
  **Test connection** button that asks Jira who the token belongs to and reports the name back,
  because "it worked" is a claim and "signed in as ..." is evidence. An unconfigured installation
  now opens on Setup rather than on an empty query console.
  The token is write-only throughout. `GET /api/connection` returns the address and whether a
  token is present, never the token, so it cannot reach a screenshot, a cache or a log; the field
  renders empty even when one is stored, and an empty field on save means *unchanged*, never
  *delete* &mdash; otherwise correcting a typo in the address would silently wipe the credential.
  Saving mutates the live configuration in place, so a credential works on the next request rather
  than the next launch.
- **Jira+ no longer fights NodeToolbox for a port.** Both defaulted to 5555, so only one could run
  &mdash; and Jira+ exists to be compared against its predecessor, which requires both to be open
  at once. Jira+ now defaults to **5556**, with the reason recorded at the constant and in the
  launcher so the next person to hit a clash knows which one moved and why.
- **The release scripts are now actually linted.** They were unlintable rather than clean: no
  Node globals were declared for that folder, so every `console` and `process` reference was an
  undefined-name error and none of the rules that matter were running on those files at all.
  Declaring the globals let the rules run, and the first thing they found was a bare `1048576` in
  both scripts &mdash; which now has a name.
- **Test fixtures no longer look like leaked credentials.** A secret scanner flagged the first pull
  request over `pat-do-not-leak-3f9a2b` &mdash; a string invented for a test that asserts it never
  leaves the process. Nothing was ever real and nothing needed revoking, but the scanner was right to
  raise it: a high-entropy value assigned to a credential field is indistinguishable from the thing
  it was imitating, and a fixture that has to be investigated before it can be dismissed has cost
  somebody their afternoon for nothing. The stand-ins are now low-entropy and say what they are.
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
