# Specification Quality Checklist: Issue Author

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-08
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Four decisions were settled before the specification was written and therefore carry no
clarification markers:

| Decision | Answer | Where it lands |
|---|---|---|
| Section template — configuration or code? | Configuration | FR-019 – FR-022, SC-005 |
| Create the issue, or only draft text? | Create it | FR-037 – FR-041, User Story 1 |
| Only Features, or any issue type? | Any type | FR-015 – FR-018 |
| Enrich an existing issue as well? | Yes | User Story 2, FR-010 – FR-014 |

Two wordings were revised during validation rather than left as written:

- An earlier draft of FR-024 said the prompt "should not invent field ids". That describes the
  assistant's behaviour, which this product cannot test. It now states what the prompt must
  contain, which can be.
- An earlier draft of SC-004 measured "proposals accepted by Jira", which depends on the assistant.
  It now measures what the product controls: that no proposal certain to be refused is sent.

Two requirements are deliberately near-duplicates of existing product behaviour, restated here
because the feature must not become the exception to them: FR-037 (see the change before it is
written) and FR-041 (never report our own failure as Jira's).


## Analysis pass, 2026-09-08

Six findings, all fixed before any code was written. No CRITICAL issues; two would have surfaced
during implementation as work that had been assumed already done.

| Finding | Severity | Fix |
|---|---|---|
| The shipped chunker divides an **issue set on issue boundaries**; an authoring prompt has no issues. The plan claimed it was reused. | HIGH | A source-boundary chunker, recorded as a Framework-First deviation. Truncation is always stated, never silent. |
| On the enrich path, nothing said where the create screen shape comes from. | HIGH | The loaded issue's own project and type. Moving an issue between projects is not this feature. |
| The shipped checks consume a `DetailedIssue`; a draft is not one, and no task bridged them. | MEDIUM | A draft-to-issue projection. The alternative — a second implementation of every check — is how the predecessor acquired five live divergences. |
| The section template was to enter the workspace fingerprint. | MEDIUM | Removed, and inverted into an assertion that it does not. The fingerprint exists so two people disputing a **number** compare eight characters; a reworded heading changes no number. |
| 16 requirements and 6 success criteria were covered but not cited. | LOW | Cited. Coverage is now 41/41 and 8/8. |
| Phase 6 tasks lacked the story label for the story they complete. | LOW | Labelled `[US1]`. |

Two of the four deviations now recorded in the plan's Complexity Tracking were found by this pass
rather than during planning, which is what the pass is for.
