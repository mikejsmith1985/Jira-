# Feature Specification: Issue Author

**Feature Branch**: `feature/issue-author`
**Created**: 2026-09-08
**Status**: Draft
**Feature Directory**: `specs/004-issue-author`

> Numbered 004 rather than 003 because `003-clone-families` is already recorded as a shipped
> feature in the agent context file, even though it never received its own directory. Reusing 003
> would make two different features answer to one number.

## Overview

A Product Owner writing a Jira issue starts with material in four places — a brief someone wrote, a
spreadsheet, two related tickets, a conversation — and what they actually know in their head. Today
that becomes an issue by retyping it, badly, into Jira's own create screen, where none of the
material is visible while they write.

This feature puts the material and the draft on one screen, lets the operator hand both to their
assistant and bring back a proposal, and then creates the issue. The gathering is most of the value
and it lands before any assistant is involved.

The same screen either creates a new issue or enriches an existing one, decided by a single field,
so enriching a stub cannot produce a duplicate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Write a new issue from scattered material (Priority: P1)

A Product Owner has a brief open in another tab, a spreadsheet of affected accounts, and a clear
idea they have not written down. They paste the brief as a labelled source, paste the relevant rows
as a second source, and write what they know in their own words. They pick the project and issue
type, copy the generated prompt into their assistant, paste the reply back, read what it proposes,
adjust the summary, and create the issue.

**Why this priority**: This is the feature. Everything else is a variation on it, and it is the
only story that has to work for the feature to be worth shipping.

**Independent Test**: Paste two sources and a narrative, choose a project and issue type, complete
one assistant round trip, and confirm a correctly-typed issue exists in Jira with the drafted
summary, description and acceptance criteria.

**Acceptance Scenarios**:

1. **Given** an empty draft, **When** the operator pastes text with a label, **Then** it appears as
   a source card showing that label and the text, and no issue field changes as a result.
2. **Given** sources and a chosen project and issue type, **When** the operator asks for a prompt,
   **Then** the prompt contains the sources, the operator's own words, the configured section
   template, and only field identifiers the chosen issue type actually offers.
3. **Given** a reply pasted back, **When** it is read, **Then** proposed values appear in the draft
   for the operator to change, and nothing has been sent to Jira.
4. **Given** a complete draft, **When** the operator creates the issue, **Then** exactly one issue
   is created and its key is shown.
5. **Given** a created issue, **When** creation fully succeeds, **Then** the draft is discarded.

---

### User Story 2 - Enrich an existing issue without creating a second one (Priority: P1)

The same Product Owner has a one-line stub someone else raised. They load it into the same screen,
which fills the draft from the issue's real values, add the material and the detail it was missing,
and save. The stub becomes a properly written issue and no second issue appears.

**Why this priority**: Equal to the first because the failure it prevents — a duplicate Feature
raised while trying to improve an existing one — is worse than not having the feature at all.

**Independent Test**: Load an existing issue, change one field, save, and confirm that issue was
updated, that no issue was created, and that fields the operator did not touch were not written.

**Acceptance Scenarios**:

1. **Given** an issue key entered, **When** the issue loads, **Then** the screen states in plain
   words that saving will update that issue and will not create a second one.
2. **Given** a loaded issue, **When** the operator changes nothing, **Then** saving is blocked with
   the reason that nothing has changed.
3. **Given** a loaded issue whose description the operator did not edit, **When** they save,
   **Then** the description is not written.
4. **Given** the issue key is cleared, **When** the operator looks at the screen, **Then** it
   states that a new issue will be created.

---

### User Story 3 - See what will be written before anything is written (Priority: P2)

Before creating or saving, the operator sees each field that will change, with its current value
beside its proposed one, and can abandon at that point.

**Why this priority**: The product's existing rule is that nothing reaches Jira without the operator
seeing the change first. Authoring must not be the exception.

**Independent Test**: Reach the point of creating, confirm every changing field is listed with both
values, decline, and confirm nothing was written.

**Acceptance Scenarios**:

1. **Given** a draft ready to write, **When** the operator asks to create or save, **Then** every
   field that will change is listed with its current and proposed values before any request is sent.
2. **Given** several fields to write, **When** one is rejected by Jira, **Then** the others still
   apply and the rejected one reports the reason Jira gave.
3. **Given** any successful write, **When** the operator looks at the record of changes, **Then**
   that write appears in it.

---

### User Story 4 - Change the section template without a new release (Priority: P3)

A team lead decides their Feature template needs a tenth section, or that two of the nine are noise.
They edit the section list in settings, and the next prompt asks for the sections they configured.

**Why this priority**: Valuable, but the feature works with the seeded template. This is what stops
the template becoming code, which is where the predecessor put it.

**Independent Test**: Add a section, generate a prompt, and confirm the new section is asked for.
Remove all sections and confirm the prompt asks for a free-form description instead.

**Acceptance Scenarios**:

1. **Given** an edited section list, **When** a prompt is generated, **Then** it asks for exactly
   those sections in that order.
2. **Given** an empty section list, **When** a prompt is generated, **Then** it asks for a
   description with no imposed structure.

---

### Edge Cases

- The operator names an issue key that does not exist, or that they cannot see: the screen says so
  and stays in create mode rather than silently offering to update nothing.
- The chosen issue type requires a field the operator has not filled: the write is blocked and the
  field is named, using the requirement Jira itself reports rather than a guess.
- The assistant proposes a field the instance does not have: it is dropped and reported, never
  silently ignored and never sent.
- The assistant proposes a value for a list field that is not one of its allowed values: it becomes
  no value rather than a guess, and is reported.
- The assistant returns text that is not a usable reply at all: the count of unusable items is
  shown rather than hidden, and the draft is unchanged.
- The material does not support a section: that section is still drafted but marked as needing
  validation, so the gap is visible rather than written over.
- The reply claims the content was written by an assistant: that claim is removed. A validation
  marker means information is missing, never a note about authorship.
- The prompt is longer than the assistant's input allows: it is divided, and the operator can see
  how many parts there are and which have been returned.
- Jira cannot be reached at all: the screen says Jira+ could not reach Jira, never that Jira
  refused, and the draft is kept.
- The page is reloaded, the application restarted, or the operator leaves to activate their browser
  relay: the draft is still there.

## Requirements *(mandatory)*

### Functional Requirements

**Gathering material**

- **FR-001**: Operators MUST be able to add a source by pasting text and giving it a label.
- **FR-002**: Operators MUST be able to add a source by supplying a single file of readable text.
- **FR-003**: Each source MUST be shown with its label and its content while the operator writes.
- **FR-004**: Operators MUST be able to remove a source.
- **FR-005**: Sources MUST NOT cause any issue field to change on their own; they are reference
  material and nothing else.

**The draft**

- **FR-006**: The draft MUST hold a summary, a description, acceptance criteria, and the operator's
  own words about the issue.
- **FR-007**: The operator's own words MUST NOT be written to Jira; they exist to steer the
  assistant and to remind the operator what they meant.
- **FR-008**: The draft MUST survive a page reload and an application restart, and MUST be
  discarded only when a create or save has fully succeeded.
- **FR-009**: Operators MUST be able to discard the draft deliberately.

**Deciding between creating and enriching**

- **FR-010**: A single field naming an existing issue MUST decide whether the operator is creating
  or enriching; there MUST be no other way to reach either outcome.
- **FR-011**: The screen MUST state, at all times and in plain words, whether it will create a new
  issue or update a named one.
- **FR-012**: Loading an existing issue MUST fill the draft from that issue's current values.
- **FR-013**: Saving MUST write only fields whose values genuinely differ from what the issue
  already holds.
- **FR-014**: When an issue key is present, the feature MUST NOT be able to create an issue.

**Choosing what is being written**

- **FR-015**: Operators MUST choose a project and an issue type for a new issue.
- **FR-016**: The issue types offered MUST come from what the instance reports for the chosen
  project, never from a fixed list.
- **FR-017**: The fields available for a draft MUST come from what the instance reports for the
  chosen project and issue type.
- **FR-018**: Fields the instance reports as required for that issue type MUST be identified as
  such.

**The section template**

- **FR-019**: The section template MUST live in the installation's configuration, as an ordered list
  of section headings each with a note on what belongs in it.
- **FR-020**: The template MUST ship seeded with nine sections: Description, Benefit Hypothesis,
  Acceptance Criteria, Assumptions, Dependencies, In Scope, Out of Scope, Risks, and Non-Functional
  Requirements.
- **FR-021**: Operators MUST be able to change the template without a new release of the product.
- **FR-022**: An empty template MUST be valid and MUST mean the description has no imposed structure.

**Asking the assistant**

- **FR-023**: The feature MUST produce a prompt built from the gathered sources, the operator's own
  words, the section template, and the fields the chosen issue type offers.
- **FR-024**: The prompt MUST name only field identifiers the instance actually has, and for a
  field with a fixed set of values MUST state those values.
- **FR-025**: A prompt too long for the assistant's input MUST be divided, and the operator MUST be
  able to see how many parts there are and which have been returned.
- **FR-026**: A reply that does not belong to this prompt MUST be rejected whole rather than partly
  applied.
- **FR-027**: A proposed field the instance does not have MUST be dropped and reported.
- **FR-028**: A proposed value outside a field's allowed values MUST become no value, and be
  reported, rather than being guessed at.
- **FR-029**: Content that cannot be read as a proposal MUST be counted and shown, never silently
  discarded.
- **FR-030**: A reply MUST NOT write anything to Jira. Proposals land in the draft, where the
  operator can change or ignore them.
- **FR-031**: A section the material does not support MUST still be drafted, and MUST be marked as
  needing validation.
- **FR-032**: Any claim that the content was written or generated by an assistant MUST be removed
  from the drafted text.

**The two gates**

- **FR-033**: The feature MUST show an advisory readiness assessment of the draft, using the same
  checks the product already applies to existing issues.
- **FR-034**: The readiness assessment MUST NOT prevent the operator from creating or saving.
- **FR-035**: The feature MUST separately identify blocking conditions and prevent the write while
  any holds: no summary, no project, no issue type, an empty field the instance requires, or nothing
  having changed.
- **FR-036**: Advisory findings and blocking conditions MUST be presented as visibly different
  things.

**Writing**

- **FR-037**: Before any request is sent, the operator MUST see every field that will change, with
  its current value beside its proposed value.
- **FR-038**: Each field write MUST succeed or fail independently of the others.
- **FR-039**: A failed write MUST report the reason the instance gave, verbatim.
- **FR-040**: Every write MUST be recorded in the product's existing record of changes.
- **FR-041**: A failure to reach Jira at all MUST be reported as the product's own inability to
  reach it, never as a refusal by Jira.

### Key Entities

- **Source** — one piece of reference material the operator gathered: a label and its text.
  Never written to Jira.
- **Draft** — what the operator is writing: a summary, a description, acceptance criteria, their
  own words, the chosen project and issue type, any values for instance-specific fields, and
  optionally the key of an existing issue being enriched. Survives restarts.
- **Section template** — an ordered list of section headings, each with a note on what belongs in
  it. Configuration, editable by the operator, seeded with nine sections.
- **Proposal** — a value the assistant suggested for one field of the draft, which the operator may
  accept, change or ignore. Never a write.
- **Blocking condition** — a reason the write cannot proceed, each naming the field or choice
  responsible.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Product Owner with material in three places can produce a correctly-typed issue,
  with its required fields populated, in a single sitting without leaving the screen except to visit
  their assistant.
- **SC-002**: Enriching an existing issue never produces a second issue, in any sequence of actions
  available on the screen.
- **SC-003**: No field is ever written that the operator did not see listed, with its old and new
  value, beforehand.
- **SC-004**: Every value the assistant proposes for a field is one the instance would accept, or is
  reported as rejected — a proposal is never sent that the instance is certain to refuse.
- **SC-005**: The section template can be changed, and the next prompt reflects the change, without
  installing a new version of the product.
- **SC-006**: A draft survives a reload, a restart, and the operator leaving the page to activate
  their browser relay.
- **SC-007**: An operator can tell, without reading documentation, whether the screen is about to
  create an issue or update one.
- **SC-008**: An advisory finding is never mistaken for a reason the write was blocked, and the
  reverse.

## Assumptions

- The operator reaches Jira either through their browser relay or a stored credential; this feature
  adds no authentication of its own and works identically either way.
- The assistant is Microsoft Copilot in a browser, reached by copying out and pasting back, within
  the same input ceiling the product's existing prompts already respect.
- A single readable text file is enough for the file case. Adapters for particular systems —
  Confluence, SharePoint, mail — are out of scope, and their absence is why this feature is a
  fraction of the predecessor's size.
- The nine seeded sections are the current organisational template and are seed values, not rules.
- The operator authors one issue at a time. Bulk authoring is out of scope.
- Attachments, issue links beyond what the operator types, component mapping and repository mapping
  are out of scope.

## Out of Scope

- Authoring many issues at once.
- Splitting one issue into several.
- Rewriting existing issues in bulk.
- Source adapters for Confluence, SharePoint, mail or any other particular system.
- Automatic component or repository mapping.
- Creating issue links the operator did not ask for.
- ServiceNow change requests.
- Any call to an assistant's programming interface.
