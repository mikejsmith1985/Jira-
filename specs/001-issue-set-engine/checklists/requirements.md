# Specification Quality Checklist: Issue Set Engine and Trust Architecture

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-01
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

### Validation pass 1 — 2026-09-01

**Corrected during drafting:**

- The first draft named the runtime stack, the state library and the HTTP framework in the
  requirements. All removed; those belong in `plan.md`, not here. "Express proxy + React client"
  survives only inside the quoted Input, which is the user's own wording.
- Requirements originally named types (`Measure` variants, `CheckDefinition` fields). Restated as
  behaviour: what the system must and must not present. The structural guarantee is now expressed as
  FR-014 — *incapable* of presenting a passing result for unobtainable data — which is testable
  without prescribing how.
- Success criteria originally cited retrieval latency and payload sizes. Replaced with user-facing
  and verifiable outcomes (SC-001, SC-002, SC-006, SC-011).

**Two [NEEDS CLARIFICATION] markers remain**, both recorded in the Open Questions section and both
meeting the bar for asking rather than defaulting:

- **OQ-001** — whether real issue content may be pasted into the organisation's chat assistant. This
  is a privacy and compliance question with no safe default: guessing permissive risks a policy
  breach, guessing restrictive removes the feature's central capability. It gates which question
  formats are usable and whether a redaction step is mandatory.
- **OQ-002** — the definitive check list. A default is available (the predecessor's catalogue), but
  the user has stated the rules are clear and known, and the predecessor's catalogue is itself
  implicated in the distrust this feature exists to remove. Inheriting it would repeat the mistake.

Both are scope-affecting, which is the highest priority band. Neither blocks `/speckit-plan` for the
retrieval, provenance, measurement and flow portions of the feature; OQ-001 blocks finalising the
question-format catalogue and OQ-002 blocks finalising the check catalogue.

### Validation pass 2 — 2026-09-01, after `/speckit-clarify`

**16 of 16 items now passing.** Four questions asked and answered; both open questions closed.

- **Transfer limits are now a first-class constraint, not an afterthought.** The assistant is
  Microsoft Copilot in a browser with an input box of roughly 18,000 characters, and full issue
  content may be sent. Division of a prompt is therefore routine rather than exceptional, which is why
  FR-035 now mandates a configurable budget below that limit, a visible part count before starting,
  and per-part return tracking — and why FR-035A refuses to divide within an issue.
- **The configuration story was internally contradictory and is now consistent.** The spec said
  configuration was stored "once per installation" while the defect it addressed was two people
  disagreeing. With each person running their own copy, that phrasing recreated the same divergence at
  machine granularity. FR-028 through FR-030B now say what is actually true: one record per
  installation, shared deliberately by whole-file import, with the fingerprint as the means by which
  two people establish whether they are comparing like with like. SC-008 was corrected to match.
- **Completion became two lenses rather than one convention.** Delivered-to-integration-test is the
  Definition of Done and the lens for Programme Increment commitments; released-to-production is the
  external milestone that reconciles with an untouched Jira report. FR-049C requires each lens to
  supply a query that reproduces it, and SC-006A asserts the two can never tell contradictory stories.
  This materially raised the feature's verifiability.
- **The check catalogue is deferred, not vague.** Three checks ship, chosen so that between them they
  exercise every reportable state: two depend on mapped concepts and demonstrate the not-measurable
  state, one depends only on a native field and stays measurable when the others are not. FR-021C and
  SC-010A make each later addition a one-file change, so the deferral carries no design debt. Both
  deferrals are recorded in the spec's Open Questions section with their rationale.

**Deferred to planning, not to the user**: performance targets, accessibility and localisation, and
the retrieval ceiling's default value. Each has a defensible default and none changes the shape of
the feature.

**Not marked as clarifications**, resolved as documented assumptions instead: Jira deployment type,
assistant transfer mechanism, completion and start conventions, retrieval ceiling, working calendar,
and team scale. Each has a defensible default that is stated on screen at runtime and is cheap to
change.
