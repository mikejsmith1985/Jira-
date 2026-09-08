# Data Model: Issue Author

Five things, and one of them decides everything else.

## Draft

What the operator is writing. Held on the server beside the workspace document, so it survives a
reload, a restart, and being navigated away from to activate the relay.

| Field | Meaning |
|---|---|
| `existingIssueKey` | The issue being enriched, or `null` for a new one. **This one field decides create versus update, and there is no other way to reach either outcome.** |
| `summary` | The issue summary. |
| `description` | The full description, sections included. |
| `acceptanceCriteria` | Acceptance criteria, kept separately because this instance has a field for it. |
| `operatorNarrative` | What the operator would say to a colleague. Steers the prompt. **Never written to Jira** (FR-007). |
| `projectKey` | Chosen project. Ignored when enriching. |
| `issueTypeId` | Chosen issue type. Ignored when enriching. |
| `fieldValues` | Values for instance-specific fields, keyed by the instance's own field id. |
| `sources` | The gathered material. |
| `loadedFieldValues` | What the enriched issue held when loaded, so a save can write only genuine changes (FR-013). |
| `updatedAtIso` | When it was last touched. |

**Rules**

- A draft with an `existingIssueKey` **cannot** produce a create. Not "should not" — the create path
  is unreachable while the key is set (FR-014).
- `loadedFieldValues` is written once, at load, and never afterwards. A save compares against it, so
  a description the operator never touched is not rewritten (FR-013).
- `operatorNarrative` never appears in a change set. It has no field id to be written to.

## Source

One piece of gathered reference material.

| Field | Meaning |
|---|---|
| `sourceId` | Distinguishes one from another. |
| `label` | What the operator called it: "the brief", "Jana's message". |
| `text` | Its content, as plain text. |
| `addedAtIso` | When it was gathered. |

**Rules**

- A source has no field id and no proposal. It cannot cause a write (FR-005). It exists to be read
  by the operator and rendered into a prompt.
- Sources are truncated when rendered into a prompt, never when stored. What the operator pasted is
  what they keep seeing.

## Section template

Configuration, in the workspace document, so it changes without a release (FR-021).

| Field | Meaning |
|---|---|
| `heading` | The section's name, as it appears in the description. |
| `guidance` | One line on what belongs in it, stated to the assistant. |

**Rules**

- An empty list is valid and means the description has no imposed structure (FR-022).
- Ships seeded with nine sections (FR-020). Seed values, not rules.
- The template is part of the workspace document, so it is covered by the existing fingerprint —
  two people comparing a drafted issue can see whether they were writing to the same template.

## Create screen shape

What the instance says this project and issue type actually offers. Never stored; read when the
operator chooses, and discarded when they change their mind.

| Field | Meaning |
|---|---|
| `fieldId` | The instance's own identifier. |
| `name` | What the instance calls it. |
| `isRequired` | Whether the instance will refuse a create without it (FR-018). |
| `allowedValues` | The permitted values, where the field has a fixed set (FR-024). |

**Rules**

- This is the **only** source of what fields exist for a draft. No field list is written down in the
  product.
- A proposal naming a `fieldId` absent from this shape is dropped and reported (FR-027).
- A proposal whose value is absent from `allowedValues` becomes no value, and is reported (FR-028).

## Blocking condition

A reason the write cannot proceed. Distinct in type from an advisory finding, so the two cannot be
rendered as the same thing (FR-036).

| Field | Meaning |
|---|---|
| `scope` | What is responsible: the draft as a whole, or one named field. |
| `reason` | Why, in words the operator can act on. |

**The five blockers** (FR-035): no summary; no project; no issue type; a field the instance requires
left empty; nothing having changed.

**Rules**

- Blocking conditions gate the whole action. One blocker prevents every write, so a partial write is
  impossible.
- A readiness finding is never a blocking condition. It has a different type, so no code path can
  turn one into the other.

## What is deliberately absent

- **No proposal store.** A proposal is applied to the draft or discarded when the operator moves on.
  Keeping unaccepted proposals invites a later screen to apply one nobody accepted.
- **No field-list constant.** Anywhere.
- **No template in code.** The nine sections exist once, as seed data for the workspace document.
