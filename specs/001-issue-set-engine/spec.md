# Feature Specification: Issue Set Engine and Trust Architecture

**Feature Branch**: `feature/issue-set-engine`

**Feature Directory**: `specs/001-issue-set-engine`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Jira+ v0 — the Issue Set engine and trust architecture. A local-first
workspace that layers over Jira with API access only: no AI keys, no browser extensions, no Jira
plugins, no project admin rights. It replaces NodeToolbox, whose 33 surfaces failed to gain adoption
because its numbers could not be trusted."

---

## Why This Feature Exists

The predecessor tool works and nobody uses it. It reached 33 surfaces and adoption never came,
because the numbers it produced could not be checked and therefore were not believed. Three
observed behaviours explain the whole failure:

1. A query naming a field that does not exist returns nothing, and nothing was displayed as a
   perfect score. Failure and success looked identical.
2. A displayed `0` meant "all clean", "nothing here applies", or "the field could not be found" —
   rendered identically, with no way to tell which.
3. Two people opening the same project ran different rules, because the rules lived privately in
   each person's browser, and neither person was ever told.

Separately, the teams are moving to Kanban while still running Scrum ceremonies. Sprints grow with
the backlog and incomplete work is carried over, so velocity reports nothing true. There is no way
today to demonstrate to leadership that the team delivers steadily.

This feature builds the foundation that makes both problems answerable: **one auditable result set,
and no number that cannot show its work.**

---

## Clarifications

### Session 2026-09-01

- Q: What issue content may leave the tool and be pasted into the chat assistant? → A: Full content —
  summary, description, acceptance criteria and comments. The assistant is Microsoft Copilot in the
  browser, with no programmatic interface; transfer is copy and paste only, and its input box accepts
  roughly 18,000 characters.
- Q: What is the definitive list of quality checks for this feature? → A: Not yet fixed. This feature
  ships a small set chosen to prove the mechanism — missing story points, missing acceptance criteria,
  and missing fix version — and the team's real catalogue is added once a denominator and a
  drill-through have been seen working on live data.
- Q: What condition counts an item as completed for flow measures? → A: Two lenses, reported side by
  side and switchable. **Delivered to integration test** is the team's Definition of Done and the
  lens for Programme Increment commitments. **Released to production** is the later, external
  milestone. Both must be reproducible by running an equivalent query directly in Jira, so any figure
  can be checked without the tool.
- Q: Is Jira+ run once for the team, or separately by each person? → A: Each person runs their own
  local copy. Configuration is therefore a file shared deliberately by export and import, and the
  configuration fingerprint is the mechanism by which two people establish whether they are comparing
  like with like.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask any question about any set of issues (Priority: P1)

A delivery lead pastes a JQL query into a console. The system retrieves every matching issue with
its full detail and history, and shows exactly what it retrieved: the query that ran, the time it
ran, how many issues matched, how many were retrieved, and whether anything was left out. The lead
picks a question format, adds their own question, copies a ready-made prompt, pastes it into their
organisation's chat assistant, and pastes the answer back. The system validates the answer against
the issues that were actually in the set and displays the result. Nothing is written to Jira.

**Why this priority**: This is the whole product in one loop, and it is the thing the user cannot do
at all today. It is useful on its own, on day one, with no configuration beyond a credential. Every
later story is a specialisation of it.

**Independent Test**: Paste a real JQL query, complete a full round trip through the chat assistant,
and read back a validated answer — with no field mapping configured, no board selected, and no write
permission exercised.

**Acceptance Scenarios**:

1. **Given** a valid JQL query matching 312 issues, **When** the user runs it, **Then** the system
   displays all 312 issues and states "312 of 312 retrieved — complete" alongside the exact query
   text and the time it ran.
2. **Given** a JQL query naming a field that does not exist, **When** the user runs it, **Then** the
   system displays an explicit failure carrying Jira's own error message, and displays **no** count,
   score, chart or result table.
3. **Given** a query matching more issues than the configured retrieval limit, **When** the user
   runs it, **Then** the system states "2,000 of 4,317 retrieved — incomplete" and marks every
   figure derived from that set as a floor rather than a total.
4. **Given** a retrieved set of issues, **When** the user selects the free-form question format and
   adds their own question, **Then** the system produces a prompt containing every issue's detail
   and a fixed instruction describing exactly how the answer must be structured.
5. **Given** a prompt too large to paste in one go, **When** the system prepares it, **Then** it
   divides the prompt on issue boundaries only, never mid-issue, states how many parts there are,
   and shows which parts have been pasted back.
6. **Given** an answer that refers to an issue key that was not in the set, **When** the user pastes
   it back, **Then** the system discards that item, states that it did so, and names the key.
7. **Given** an answer produced for a different question format, **When** the user pastes it back,
   **Then** the system rejects the whole answer and names the mismatch.

---

### User Story 2 - Prove the team delivers, without sprints (Priority: P2)

A delivery lead defines the team's work with a JQL query and receives a set of flow measures derived
from each issue's actual history: how many items completed each week, how long items take to finish,
how work accumulates, which in-progress items are older than normal, and how much of an item's life
is spent waiting rather than being worked. Every point on every chart can be opened to the exact
issues behind it. The whole thing exports as a single page carrying the charts, the full issue list,
the query, and the retrieval counts — so a sceptic can reproduce it.

**Why this priority**: This is the artifact the user needs for a leadership conversation, and it is
the argument for the Kanban transition. It depends only on Story 1's retrieval, not on any
configuration.

**Independent Test**: Point it at the team's real work for the last six months and produce an export
whose weekly completion count can be independently reproduced by running the stated query in Jira.

**Acceptance Scenarios**:

1. **Given** six months of issue history, **When** the user opens the flow view, **Then** the system
   displays completed items per week with a rolling average, and states in plain words which
   condition it treated as "completed".
1a. **Given** the flow view, **When** the user switches the completion lens between delivered-to-
   integration-test and released-to-production, **Then** every measure on screen recomputes under the
   new lens, and the lens in force is named on every chart and in every export.
1b. **Given** either lens, **When** the user asks how a figure could be checked, **Then** the system
   supplies a Jira query that reproduces exactly the same set of completed items for that period.
2. **Given** the same set, **When** the user views cycle time, **Then** the system plots one point
   per completed item and marks the 50th, 85th and 95th percentile durations.
3. **Given** any chart element, **When** the user selects it, **Then** the system lists exactly the
   issues that element represents, and the count of that list equals the number the element showed.
4. **Given** an issue that was held by four different people, **When** team totals are calculated,
   **Then** that issue contributes exactly one item to the team total, not four.
5. **Given** per-person figures, **When** they are summed, **Then** the sum equals the team total for
   the same period.
6. **Given** an issue whose history was not retrieved, **When** flow measures are calculated,
   **Then** that issue is reported as not measurable and is excluded from every figure, with the
   exclusion stated and countable.
7. **Given** a completed flow view, **When** the user exports it, **Then** the export contains the
   charts, every issue key with a link, the exact query, the retrieval counts, the time, and the
   configuration identifier in force.

---

### User Story 3 - Know exactly what the app is reading (Priority: P3)

Before any check runs, the user confirms which Jira field each concept maps to. For each concept the
system offers the candidate fields it found, showing each candidate's identifier, Jira's own name for
it, its type, and a real value taken from an issue the user names. The user chooses. Nothing is
chosen automatically. The resulting configuration is stored once for everyone using this
installation, carries a short identifier displayed in the header, and that identifier is stamped on
every result and every export.

**Why this priority**: This is the fix for the two most damaging predecessor defects — a wrong field
silently producing clean results, and two people unknowingly running different rules. It must exist
before checks are believable, but it delivers value alone: it tells the user what the tool is
actually looking at.

**Independent Test**: Configure the mapping from scratch on a live Jira, confirm each field by seeing
a real value from a named issue, and observe the configuration identifier appear in the header and on
an export.

**Acceptance Scenarios**:

1. **Given** an unconfigured installation, **When** the user opens setup, **Then** every concept is
   listed as unmapped, and the system proposes candidates without selecting any.
2. **Given** a candidate field, **When** it is displayed, **Then** the system shows its identifier,
   Jira's own name for it, its type, and a real value from an issue the user named.
3. **Given** two fields whose names both match a concept, **When** the system proposes candidates,
   **Then** it presents both and requires the user to choose; it never picks one silently.
4. **Given** a concept that does not exist on this Jira, **When** the user records that fact,
   **Then** the system stores it as a confirmed absence, distinct from "not yet mapped".
5. **Given** a change to the configuration, **When** it is saved, **Then** the displayed
   configuration identifier changes, and results produced before the change remain stamped with the
   previous identifier.
6. **Given** two people using the same installation, **When** they view the same result, **Then**
   they see the same configuration identifier and the same numbers.

---

### User Story 4 - Hygiene findings that survive being checked (Priority: P4)

The user runs a set of quality checks over a retrieved issue set. Every check reports as "N of M" —
how many issues failed, out of how many the check actually applies to. Selecting the number lists
exactly those issues. A check whose required field is unmapped reports as not measurable, in a
distinct state, and is excluded from any overall figure. A check with nothing in scope reports "0 of
0 — nothing in scope", visually distinct from "0 of 40 — all clean".

**Why this priority**: Hygiene is the surface the user says is most broken. It is also the clearest
demonstration of the trust architecture, but it depends on Story 3's mapping to be meaningful.

**Independent Test**: Run the checks, then deliberately unmap one field and confirm its dependent
checks change from a green figure to an explicit not-measurable state — never to a passing score.

**Acceptance Scenarios**:

1. **Given** 40 issues a check applies to and 3 failing, **When** results display, **Then** the check
   reads "3 of 40" and selecting it lists exactly 3 issues.
2. **Given** 40 issues a check applies to and 0 failing, **When** results display, **Then** the check
   reads "0 of 40" and is presented as a pass.
3. **Given** no issues in scope that the check applies to, **When** results display, **Then** the
   check reads "0 of 0 — nothing in scope", is visually distinct from a pass, and is excluded from
   any overall figure.
4. **Given** a check whose required field is unmapped or ambiguous, **When** results display, **Then**
   the check reads as not measurable, names the missing concept, offers a route to setup, and is
   counted as neither passing nor failing.
5. **Given** a retrieval that failed, **When** results display, **Then** every check reads as not
   measurable and no overall figure is shown at all.
6. **Given** any check result, **When** the user opens its denominator, **Then** the system lists
   exactly the issues the check applies to, so a wrong population is visible before the finding is
   believed.
7. **Given** the full set of checks, **When** the catalogue is displayed, **Then** every check that
   the system can evaluate appears in it — no check is evaluated and then hidden.

---

### User Story 5 - Change issues safely, and see what you changed (Priority: P5)

Having reviewed proposals — whether from the chat assistant or from a one-click deterministic fix —
the user selects which to accept, sees exactly what will change on each issue as "was → will be",
and applies them. Each issue succeeds or fails on its own. Every change is recorded in a log the
user can open later to see what this tool changed and when.

**Why this priority**: Writing is what turns findings into work done, but it must come last: the
value of a proposal is worthless until the numbers behind it are trusted.

**Independent Test**: Accept proposals for three issues, review the diff, apply, then open those
issues in Jira and confirm the changes, and confirm all three appear in the log.

**Acceptance Scenarios**:

1. **Given** a set of accepted proposals, **When** the user requests to apply, **Then** the system
   displays every field that will change, showing its current and proposed value, before any change
   is sent.
2. **Given** a proposal whose value equals the issue's current value, **When** the change set is
   built, **Then** no change is sent for that field.
3. **Given** a proposal that cannot be applied because required information is missing, **When** the
   change set is built, **Then** the whole action is blocked with the reason stated, so no partial
   set is written.
4. **Given** five accepted changes where the third fails, **When** they are applied, **Then** the
   other four still succeed and the failure is reported against the third with its reason.
5. **Given** any successful change, **When** the user opens the change log, **Then** the change is
   listed with the issue, the field, and the time.
6. **Given** a deterministic one-click fix, **When** the user runs it, **Then** it produces the same
   kind of reviewable change set as an assistant proposal, with no prompt to author.

---

### Edge Cases

- **A query returns zero issues.** Distinguished from a failed query: reported as an empty but
  successful retrieval, and every derived figure reports "nothing in scope", never a pass.
- **A query fails on permissions rather than syntax.** Reported distinctly, naming the projects that
  could not be read, so the user does not mistake a permission gap for an empty backlog.
- **Issue history is unavailable or incomplete.** Flow measures report the affected issues as not
  measurable and state how many were excluded; they are never silently dropped.
- **An item was never started before completing.** Reported with a stated convention rather than a
  zero duration that would distort percentiles.
- **An item was completed, reopened, and completed again.** The convention in force is stated on the
  chart, so two readers cannot compute different answers.
- **An item reached integration test, then regressed.** Counted as delivered on its most recent
  qualifying entry, with the convention stated, so a regression cannot inflate a period's count.
- **An item reached production without ever passing through integration test.** Counted under the
  production lens and reported as an exception under the integration lens, rather than being made to
  disappear from one of them.
- **A period's two lenses disagree in the wrong direction** — more released than delivered. Treated
  as a data or configuration fault and reported as such, never displayed as a result.
- **An item was unassigned for part of its life.** That time is attributed to an explicit
  "Unassigned" holder, never charged to whoever picked it up next.
- **Only some parts of a divided prompt are pasted back.** Progress is shown per part; results are
  presented as covering only the parts received.
- **One issue's detail alone exceeds the transfer budget.** Reported as untransferable and named, with
  the remaining issues still processed — never divided mid-issue, never quietly dropped.
- **The assistant returns malformed output.** The system repairs only well-understood formatting
  defects; anything still unreadable is counted and reported, never discarded silently.
- **The assistant omits a field entirely.** Omission is treated as "no opinion", never as a value —
  in particular it can never clear a value a person set.
- **The assistant returns the same issue twice.** The duplicate is flagged rather than silently
  merged.
- **A field is renamed in Jira after mapping.** Detected on next use and reported as a mapping that
  needs re-confirmation, not silently re-resolved.
- **Two concepts resolve to the same Jira field.** Permitted, but stated, so the user can confirm it
  is intended.
- **Two people compare exports carrying different configuration identifiers.** The difference is
  visible on both documents before any figure is compared, so a disagreement about numbers resolves
  to a disagreement about configuration rather than about reality.
- **A stored configuration predates a change to the application's own rules.** Detected on load and
  reported as needing review, rather than being interpreted under the new rules without saying so.
- **The credential is invalid or expired.** Reported as an authentication failure distinct from every
  other failure, with no partial results shown.

---

## Requirements *(mandatory)*

### Retrieval and provenance

- **FR-001**: Users MUST be able to enter an arbitrary JQL query and retrieve every matching issue.
- **FR-002**: The system MUST retrieve each issue's full field detail and its change history in a
  single retrieval, so that no later feature needs to query Jira again.
- **FR-003**: The system MUST record, for every retrieval: the exact query text, the time it ran, the
  total Jira reported as matching, the number actually retrieved, whether retrieval was incomplete,
  and the configuration identifier in force.
- **FR-004**: The system MUST display that record alongside the results, and MUST allow the user to
  copy the exact query text.
- **FR-005**: The system MUST treat incomplete retrieval as a visible state, and MUST mark every
  figure derived from an incomplete retrieval as a lower bound rather than a total.
- **FR-006**: When a retrieval fails, the system MUST display Jira's own error text and MUST NOT
  display any count, score, chart or result derived from that retrieval.
- **FR-007**: The system MUST distinguish, in its reporting, a failed retrieval, an empty successful
  retrieval, an incomplete retrieval, and a permission-restricted retrieval.
- **FR-008**: Every feature in this system MUST derive its results from a retrieved issue set and
  MUST NOT issue a Jira query of its own.

### Results and their presentation

- **FR-009**: The system MUST NOT present any count, score or percentage that is not accompanied by
  the population it was measured against.
- **FR-010**: Every displayed count MUST be openable to a list of exactly the issues it counts, and
  the length of that list MUST equal the displayed count.
- **FR-011**: Every displayed population MUST be openable to a list of exactly the issues it
  comprises.
- **FR-012**: When the population for a measure is empty, the system MUST present it as "nothing in
  scope" in a form visually distinct from a passing result, and MUST exclude it from any aggregate
  figure.
- **FR-013**: When a measure cannot be calculated — because retrieval failed, or because required
  configuration is missing or ambiguous — the system MUST present it in a state distinct from both
  passing and failing, MUST name the reason, and MUST NOT include it in any aggregate figure.
- **FR-014**: The system MUST NOT be capable of presenting a passing or complete result for any
  measure whose underlying data could not be obtained.
- **FR-015**: Every displayed result MUST carry the retrieval record and configuration identifier
  that produced it, available to the user without leaving the view.

### Checks

- **FR-016**: Each check MUST declare, in one place, its identity, its severity, the concepts it
  requires, the population it applies to, and the condition it tests.
- **FR-017**: The catalogue of checks presented to the user MUST be derived from those declarations,
  so that no check can be evaluated without appearing, and none can appear without being evaluated.
- **FR-018**: A check's declared population MUST be the same population reported as its denominator.
- **FR-019**: A check MUST read Jira data only through mapped concepts, and MUST NOT reference a raw
  Jira field identifier.
- **FR-020**: A check whose required concept is unmapped, ambiguous, or confirmed absent MUST report
  as not measurable and MUST NOT be evaluated as passing.
- **FR-021**: Users MUST be able to enable or disable individual checks, and that setting MUST be part
  of the workspace configuration rather than a personal preference.
- **FR-021A**: This feature MUST ship exactly three checks, chosen so that between them they exercise
  every reportable state: **missing story points** and **missing acceptance criteria**, each depending
  on a mapped concept and therefore demonstrating the not-measurable state when that concept is
  unmapped; and **missing fix version**, which depends only on a field Jira always provides and
  therefore remains measurable when the others are not.
- **FR-021B**: The missing-fix-version check MUST apply to every issue type that can carry a fix
  version, not only to the highest-level types. In the predecessor this check was restricted to
  feature-level issues and consequently reported nothing across a backlog of seventy-two affected
  items; that population error is the specific regression this check exists to prove is gone.
- **FR-021C**: Adding a check MUST require no change to any catalogue, list, identifier union or user
  interface beyond its own declaration — demonstrable by adding one check and changing exactly one
  file.

### Field mapping

- **FR-022**: The system MUST discover the Jira fields available on the connected instance, and MUST
  report a failure to do so as an explicit error rather than proceeding with defaults.
- **FR-023**: The system MUST NOT ship or apply any default field identifier.
- **FR-024**: The system MUST propose candidate fields for each concept by exact name correspondence
  only, and MUST NOT select any candidate automatically.
- **FR-025**: For each candidate, the system MUST display its identifier, Jira's own name for it, its
  type, and a real value read from an issue the user names.
- **FR-026**: The system MUST present every candidate when more than one matches, and MUST require an
  explicit choice.
- **FR-027**: Users MUST be able to record that a concept has no corresponding field on this
  instance, and the system MUST treat that as a confirmed answer distinct from "unmapped".

### Configuration

- **FR-028**: All configuration capable of altering a displayed number MUST be held in exactly one
  record per installation, outside the browser, so that every view, export and result within an
  installation is produced from the same configuration.
- **FR-029**: The system MUST derive a short identifier from that configuration, display it
  persistently, and stamp it onto every result and export — so that two people running separate
  installations can establish, from the artifacts alone, whether they were configured identically.
- **FR-030**: Users MUST be able to export the configuration as a single file and import one, and an
  import MUST replace the configuration wholly rather than merging into it, so that an import always
  yields the exporter's identifier exactly.
- **FR-030A**: When an imported configuration differs from the current one, the system MUST show what
  changed and require confirmation before replacing it.
- **FR-030B**: Results produced before a configuration change MUST retain the identifier that
  produced them, and the system MUST mark any displayed result whose identifier no longer matches the
  current configuration as stale rather than silently re-attributing it.
- **FR-031**: Per-person browser storage MUST be limited to presentation preferences that cannot
  alter any displayed number.

### Question formats and the assistant round trip

- **FR-032**: The system MUST provide ready-made question formats that require no authoring, and at
  least one free-form format into which the user adds their own question.
- **FR-033**: Each question format MUST declare its expected answer shape once, and the system MUST
  derive both the instructions given and the validation applied from that single declaration.
- **FR-034**: The system MUST produce a prompt containing the retrieved detail for every issue in
  scope, rendering an absent value explicitly rather than omitting the field.
- **FR-035**: The system MUST divide a prompt that exceeds the assistant's transfer budget into parts,
  dividing on issue boundaries only and never within an issue. Each part MUST be independently
  complete — carrying the full instruction, its own list of covered issues, and its position in the
  sequence — and the system MUST show which parts have been returned. The budget MUST be
  configurable, MUST default below the assistant's known input limit to leave room for the user's own
  appended question, and the system MUST display the resulting part count before the user begins.
- **FR-035A**: When a single issue's detail alone exceeds the transfer budget, the system MUST report
  that issue as untransferable and continue with the rest, rather than dividing within it or silently
  omitting it.
- **FR-036**: Each prompt part MUST state the issues it covers, and the system MUST discard any
  returned item referring to an issue outside that list, reporting each discarded item.
- **FR-037**: The system MUST reject an entire answer produced for a different question format, and
  MUST state the mismatch.
- **FR-038**: The system MUST treat an omitted value as "no opinion" and MUST NOT allow an omission
  to clear or alter an existing value.
- **FR-039**: The system MUST treat a returned value outside a declared set of permitted values as
  absent rather than substituting a nearest match.
- **FR-040**: The system MUST report the number of returned items it could not interpret.
- **FR-041**: The system MUST NOT apply any returned proposal automatically; every change requires an
  explicit human acceptance.

### Applying changes

- **FR-042**: The system MUST present every proposed change as its current and proposed value before
  any change is sent.
- **FR-043**: The system MUST omit from the change set any field whose proposed value equals its
  current value.
- **FR-044**: When any part of a change set cannot be applied, the system MUST block the whole action
  and state why, rather than writing part of it.
- **FR-045**: Once a change set is applied, each issue's outcome MUST be independent; one failure
  MUST NOT prevent or undo the others.
- **FR-046**: The system MUST record every change it makes and MUST allow the user to review that
  record within the application.
- **FR-047**: The system MUST provide deterministic one-click fixes that produce the same reviewable
  change set as an assistant proposal, with no prompt authoring.

### Flow measures

- **FR-048**: The system MUST derive all flow measures from issue history, and MUST NOT use sprint
  membership or sprint boundaries in any calculation.
- **FR-049**: The system MUST state, alongside every flow view, the condition it treated as
  "completed" and the condition it treated as "started", in words a reader can act on.
- **FR-049A**: The system MUST support two completion lenses over the same issue set: **delivered to
  integration test**, being the team's Definition of Done, and **released to production**. Users MUST
  be able to switch between them and MUST be able to see both side by side.
- **FR-049B**: Switching the completion lens MUST change every flow measure consistently — completed
  counts, durations, percentile bands, accumulation and unfinished-work age — so that no two measures
  on screen are ever computed under different lenses.
- **FR-049C**: For each lens the system MUST provide an equivalent Jira query that reproduces the
  same set of completed items for the same period, so that any figure can be independently verified
  without this tool.
- **FR-049D**: An item completed under one lens but not the other MUST be reported as still in
  progress under the stricter lens, and MUST NOT be omitted from either view.
- **FR-049E**: Which conditions constitute each lens MUST be part of the workspace configuration, and
  therefore MUST be reflected in the configuration identifier stamped on every result.
- **FR-050**: The system MUST report completed items per period, the distribution of completion
  durations with stated percentiles, the accumulation of work over time, the age of currently
  unfinished work relative to those percentiles, the proportion of an item's life spent waiting
  versus being worked, and the composition of completed work by type.
- **FR-051**: Team-level totals MUST count each issue exactly once, regardless of how many people
  held it.
- **FR-052**: Where work is attributed to individuals, the attributions for an issue MUST sum to
  exactly that one issue, and per-person totals MUST sum to the team total.
- **FR-053**: The system MUST attribute time during which an issue had no assignee to an explicit
  unassigned holder.
- **FR-054**: The system MUST exclude issues whose history is unavailable from flow measures, MUST
  report how many were excluded, and MUST NOT treat them as zero.
- **FR-055**: Users MUST be able to export a single document containing the flow measures, every
  contributing issue key with a link, the query, the retrieval record, and the configuration
  identifier.

### Access and credentials

- **FR-056**: The system MUST require exactly one credential to operate: access to Jira.
- **FR-057**: The credential MUST NOT be exposed to the browser at any point.
- **FR-058**: The system MUST operate using read and write permissions on issues only, and MUST NOT
  require administrative rights on any Jira project.
- **FR-059**: The system MUST support connecting through a corporate network that inspects encrypted
  traffic.

---

### Key Entities

- **Issue Set**: A frozen snapshot of the issues matching one query at one moment, together with
  their full detail and history. Every result in the system is derived from one of these. It is never
  modified after creation.
- **Retrieval Record**: The account of how an Issue Set came to exist — the query, the time, the
  totals, whether it was incomplete, whether it failed and why, and the configuration in force.
- **Measure**: The only form in which a quantity may be presented. It is either measured (carrying
  both the items counted and the population they were counted against), inapplicable (nothing in
  scope), or unresolvable (naming what prevented calculation).
- **Check**: A single declaration of a quality rule — its identity, severity, required concepts,
  population, condition, and optional linked fix.
- **Concept (Logical Field)**: A named piece of information the system needs — story points,
  acceptance criteria, parent feature, target start, target end, program increment — which must be
  mapped to a real Jira field before any check depending on it can run.
- **Field Mapping**: The confirmed correspondence between concepts and Jira fields, in one of four
  states: resolved, ambiguous, unmapped, or confirmed absent.
- **Completion Lens**: A named definition of what counts as finished — *delivered to integration
  test* (the team's Definition of Done, used for Programme Increment commitments) or *released to
  production*. Each carries the conditions that define it and an equivalent Jira query that
  reproduces it. Every flow measure is computed under exactly one lens at a time, and the lens in
  force is always displayed.
- **Workspace Configuration**: The single installation-wide record of field mapping, check
  enablement, completion lens definitions, working calendar and retrieval limits, identified by a
  short fingerprint.
- **Question Format (Prompt Pack)**: A declaration of what a chat assistant is asked and what shape
  its answer must take, from which both the instruction and the validation are derived.
- **Proposal**: A suggested change to one field of one issue, always requiring human acceptance.
- **Change Set**: The reviewed collection of accepted proposals, containing only genuine differences,
  applied item by item.
- **Change Log**: The permanent local record of every change this system made.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user completes first-run setup and retrieves a real issue set within 10 minutes,
  supplying exactly one credential.
- **SC-002**: A user completes a full round trip — query, prompt, assistant, validated answer — in
  under 5 minutes for a set of 100 issues, without writing any prompt text beyond their own question.
- **SC-003**: 100% of displayed counts open to a list whose length equals the displayed count,
  verified across the whole check catalogue by automated assertion.
- **SC-004**: In 100% of induced failure conditions — invalid field reference, unmapped concept,
  ambiguous concept, failed field discovery, expired credential — no passing or complete result is
  displayed.
- **SC-005**: A deliberately broken field mapping changes every dependent result to an explicit
  not-measurable state, demonstrable in under 60 seconds.
- **SC-006**: For each completion lens, a weekly completion count produced by the system matches,
  exactly, the count obtained by running that lens's stated query directly in Jira for the same
  period.
- **SC-006A**: For any period, the count of items delivered to integration test is greater than or
  equal to the count released to production, and every item in the production figure also appears in
  the integration figure — verified by automated assertion, so the two lenses can never tell
  contradictory stories.
- **SC-007**: Per-person attributions sum to the team total for the same period with zero discrepancy.
- **SC-008**: Two people running separate installations who have imported the same configuration file
  obtain identical configuration identifiers and identical numbers for the same query; if their
  identifiers differ, both can see that they differ before comparing any number.
- **SC-009**: A user unfamiliar with the tool can determine, from the screen alone, whether a
  displayed zero means "all clean", "nothing applies", or "cannot be determined", in 100% of cases.
- **SC-010**: Every change the system makes to Jira appears in the change log, with no unlogged
  writes.
- **SC-010A**: Adding a new quality check requires changing exactly one file and no catalogue, list
  or interface elsewhere — measured by the diff of adding one.
- **SC-011**: A reader given only an exported delivery document can reproduce its headline figure
  from Jira without assistance from its author.

---

## Assumptions

- **Jira Data Center or Server**, reached with a personal access token. Jira Cloud is out of scope
  for this feature; the design keeps the difference isolated so Cloud can be added later.
- **The chat assistant is Microsoft Copilot in the browser**, reached by copy and paste. There is no
  programmatic interface, no ability to set system instructions, and no guaranteed structured-output
  mode. Its input box accepts roughly 18,000 characters, so the default transfer budget sits below
  that to leave room for the user's own appended question. Answer quality varies between sessions and
  cannot be regression-tested — which is why nothing applies automatically.
- **Full issue content may be transferred**, including descriptions, acceptance criteria and
  comments. No redaction step is required. The transfer budget, not confidentiality, is the binding
  constraint on how much can be sent at once.
- **Issue history is available on retrieval.** If the connected Jira does not return history with a
  search, the system retrieves it per issue instead; this is slower but not blocking. This is the one
  assumption that could change delivery order and must be verified first.
- **Both completion lenses are defined by status conditions recorded in configuration**, not by board
  columns, because board configuration is out of scope for this feature. "Released to production"
  defaults to Jira's own done category so that it reconciles with an untouched Jira report;
  "delivered to integration test" is defined by the team's own named status. "Started" defaults to
  Jira's in-progress category. Every convention in force is stated on screen and is replaceable when
  board support arrives.
- **Each person runs their own local copy**, against their own Jira credential. There is no hosted
  instance and no server to provision. Consistency between people is achieved by sharing the
  configuration file and comparing fingerprints, not by a shared store — a deliberate trade that buys
  zero infrastructure at the cost of an explicit sharing step. A team-hosted deployment would replace
  the file with a configuration service; the configuration is kept behind a single boundary so that
  substitution is contained, but it is not in this scope.
- **One team is the proof target** for the first two weeks, with the author as the primary user.
- **Retrieval is limited to a configurable ceiling**, defaulting to a few thousand issues, because an
  unbounded retrieval of full detail plus history is slow. The limit and any truncation are always
  visible.
- **The user has permission to browse the projects they query and to edit the issues they change.**
  No administrative rights are assumed anywhere.
- **Working-time calculations use a configurable calendar** with weekends excluded by default and
  holidays declarable.
- **Prior tooling is not migrated.** Configuration is established fresh, because inherited defaults
  were a principal source of the distrust this feature exists to remove.

---

## Out of Scope

Deliberately excluded from this feature, and recorded so the boundary is not eroded:

- The board-native roll-up, its column refinements, and drag-to-move — **feature 002**.
- Cross-project clone families, discipline sub-lanes, and whole-family progress — **feature 003**.
- ServiceNow change-request creation as an integration. A question format that drafts change text is
  in scope; writing to ServiceNow is not.
- Confluence, GitHub, and SharePoint connectivity of any kind.
- Scheduled jobs, email digests, webhooks and notifications.
- Program Increment and Agile Release Train concepts.
- Sprint-based measures of any kind, including velocity and burn-down.
- Natural-language-to-JQL translation.
- A Jira Cloud adapter.
- Packaged executable distribution.

---

## Open Questions

None outstanding. All scope-affecting decisions are recorded in the Clarifications section above.

Two matters are deliberately deferred rather than unresolved:

- **The team's full quality-check catalogue.** This feature ships three checks to prove the mechanism
  (FR-021A). The real catalogue follows once a denominator and a drill-through have been seen working
  on live data. FR-021C makes each addition a single-file change, so deferring costs nothing.
- **Whether issue history arrives with a search or must be fetched per issue.** A technical property
  of the connected Jira, resolvable by one request. Both paths are specified (FR-002, FR-054); which
  one is used changes speed, not behaviour.
