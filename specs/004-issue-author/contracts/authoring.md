# Contract: Authoring

What the engine promises the interface, and what the server promises the browser.

## Engine

### `buildCreateScreenShape(adapter, projectKey, issueTypeId) → CreateScreenShape | Unavailable`

Reads what the instance offers for one project and issue type.

**Which project and type, on each path** — this was unstated and two implementations would have
disagreed:

| Path | Project and type |
|---|---|
| Creating | The ones the operator chose. |
| Enriching | **The loaded issue's own**, read from the issue itself. The operator does not choose them and cannot change them; moving an issue between projects or types is not this feature. |

- Returns every field with its identifier, its name, whether the instance requires it, and its
  allowed values where it has a fixed set.
- On failure returns **unavailable with the reason**, never an empty field list. An empty list and a
  failed read are different states and must not render the same: one means the type has no fields,
  the other means we do not know.

### `describeAuthoringPack(draft, shape, template) → PromptPack`

The draft's sibling of the existing pack shape. Same `itemSchema` machinery, so the prompt's
required reply shape and the parser descend from one declaration and cannot drift.

- The prompt contains: the gathered sources, the operator's narrative, the section headings and
  their guidance, and the field list from `shape`.
- Field identifiers in the prompt are **exactly** those in `shape`. For a field with allowed values,
  the prompt states them.
- The prompt never contains a field identifier written down in the product.

**Chunking is NOT the shipped chunker.** `buildPromptChunks` divides an issue set on **issue**
boundaries, and an authoring prompt has no issues — it has one draft and its sources. So authoring
divides on **source** boundaries instead: the draft, the narrative, the section template and the
field list are the fixed head that every part repeats, and the sources fill the remainder.

- A single source too large for one part is truncated at a boundary and **said to be truncated**,
  in the prompt and on screen. Silently sending half of somebody's pasted brief is the failure this
  avoids.
- Each part states which it is and how many there are, and returns are tracked per part, exactly as
  the existing pack panel already does (FR-025).

### `parseAuthoringReply(reply, shape, template) → AuthoringProposal`

- A reply whose pack identifier is not this pack's is **rejected whole** (FR-026).
- A proposed field identifier absent from `shape` is dropped and named in `rejectedFieldIds`
  (FR-027).
- A proposed value absent from that field's allowed values becomes `null` and is named in
  `rejectedValues` (FR-028).
- Content that cannot be read is counted in `unparsedCount` (FR-029).
- The description is re-emitted with every configured section present and in order; a section the
  reply did not supply is drafted with a validation marker (FR-031).
- Claims of assistant authorship are removed from the text (FR-032).
- **Returns a proposal. Writes nothing.** (FR-030)

### `buildAuthoringChangeSet(draft, shape) → ChangeSet`

The `shape` is always the one for the issue being written: the operator's chosen project and type
when creating, the loaded issue's own when enriching.

Reuses the shipped change-set type, so the existing was-to-will-be diff renders it unchanged.

- With no `existingIssueKey`: one planned create carrying every non-empty field.
- With an `existingIssueKey`: one planned change per field whose value **differs from
  `loadedFieldValues`**. A field the operator did not touch produces no change (FR-013).
- Blockers are the five in the data model. Any blocker makes the whole set unappliable, so a partial
  write cannot happen (FR-035).
- **A draft carrying an `existingIssueKey` can never yield a create.** This is the guarantee behind
  Story 2, and it is structural rather than checked.

### `projectDraftAsIssue(draft, shape) → DetailedIssue`

The shipped checks consume a `DetailedIssue`, and a draft is not one. This projects the draft into
that shape so the checks run unchanged rather than being reimplemented against a second type — a
second implementation of a check is how the predecessor ended up with five live divergences.

- A field the draft has not filled projects as **absent**, not as empty, so a check reports it the
  same way it would on a real issue.
- When enriching, the projection starts from the loaded issue so a check sees the whole issue, not
  only the parts the operator has touched.
- The projection is never sent to Jira. It exists to be read by checks.

### `assessDraftReadiness(draft, shape, configuration) → readonly Finding[]`

Runs the shipped checks over `projectDraftAsIssue`. Advisory. Its return type is not
`ChangeBlocker` and cannot be passed where one is expected (FR-034, FR-036).

## Server

### `GET /api/authoring/draft`

The stored draft, or an empty one on first use. An absent draft is a normal first state, not an
error.

### `PUT /api/authoring/draft`

Replaces the stored draft. Written to the profile directory so it survives a reload, a restart, and
navigating away to activate the relay (FR-008).

### `DELETE /api/authoring/draft`

Discards it. Called deliberately by the operator (FR-009), and automatically on a fully successful
create or save — **only** on full success, so a failed write never loses the work.

## Jira, through the existing proxy

Every call below goes through the one proxy route, so it works identically with a token or through
the relay, and every write reaches the journal.

| Purpose | Call |
|---|---|
| Issue types for a project | `GET /rest/api/2/issue/createmeta/{projectKey}/issuetypes` |
| Fields for one type | `GET /rest/api/2/issue/createmeta/{projectKey}/issuetypes/{issueTypeId}` |
| Load an issue to enrich | `GET /rest/api/2/issue/{key}` |
| Create | `POST /rest/api/2/issue` |
| Update one field | `PUT /rest/api/2/issue/{key}` |

**No new Jira transport.** The authoring feature adds routes to the adapter and nothing to the
transport layer.

## Invariants the tests assert

1. A draft with an `existingIssueKey` yields no create, for every input.
2. A change set contains no field whose proposed value equals its loaded value.
3. Every field identifier in a generated prompt appears in the create screen shape.
4. No `customfield_` literal exists in authoring source outside the field map — the ratchet the
   product already enforces.
5. A readiness finding cannot be constructed where a blocking condition is required.
6. `operatorNarrative` never appears in a change set.
7. A parsed reply produces a description containing every configured section, in order.
8. A prompt part never contains a source silently cut short — truncation is always stated.
9. A draft projected as an issue reports an unfilled field as absent, never as empty.
