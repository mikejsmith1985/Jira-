# Phase 0 Research: Issue Author

Four questions had to be answered before the technical approach could be fixed. Three are settled
by evidence; one is an assumption with a named fallback.

## 1. How does this instance report what a create screen offers?

**Decision**: `GET /rest/api/2/issue/createmeta/{projectKey}/issuetypes` for the list of types, then
`GET /rest/api/2/issue/createmeta/{projectKey}/issuetypes/{issueTypeId}` for that type's fields.

**Rationale**: This is the paged Data Center form, available from Jira 8.4. The predecessor calls
exactly these two endpoints against **this instance** and its Feature Composition screen works, so
this is evidence from the deployment that matters rather than a reading of documentation. The
per-type response carries `required`, `schema` and `allowedValues` per field, which is precisely
what FR-017, FR-018 and FR-024 need.

**Alternatives considered**:

- The single-call `GET /rest/api/2/issue/createmeta?projectKeys=…&expand=projects.issuetypes.fields`
  form. **Rejected**: deprecated on Data Center, returns everything for every type in one response,
  and on a project with many types it is large enough to be slow for no benefit — the operator has
  chosen one type by the time the fields matter.
- Deriving fields from `/rest/api/2/field` (the catalogue Jira+ already reads for concept mapping).
  **Rejected**: it lists every field in the instance, not the ones on this create screen, and it
  carries neither `required` nor `allowedValues`. Using it would put fields on screen that the
  create call then refuses — the class of confident-wrong-answer this product exists to remove.

## 2. Can an issue be created through the browser relay?

**Decision**: Yes, and it needs no special handling beyond what the relay already does.

**Rationale**: The relay executes `fetch` inside the Jira tab with the session cookie, and already
sends `X-Atlassian-Token: no-check` on every request — the header Data Center requires before it
will accept a cookie-authenticated write. `POST /rest/api/2/issue` is an ordinary write; nothing
about it differs from the field updates the hygiene fixes already perform through the same path.

**Consequence for this feature**: authoring works with no personal access token, and needs no code
of its own to achieve that. The relay is a dependency, not a thing to build again.

## 3. Where does a draft live so it survives a restart?

**Decision**: Server-side, in the profile directory beside the workspace document, one draft per
installation.

**Rationale**: FR-008 requires a draft to survive a page reload **and** an application restart, and
SC-006 adds surviving the operator leaving the page to click the relay bookmarklet. Browser storage
survives all three, but it also fails silently in ways that matter here: a cleared site setting, a
private window, or a browser configured to block site data loses work the operator typed. The
predecessor stores drafts in browser storage and carries a permanent banner warning that work may be
lost — a banner is not a solution to that.

Jira+ already owns a profile directory and already writes a workspace document to it. A draft is
larger than a preference and smaller than an issue set, and the operator's machine is the only place
it belongs.

**Alternatives considered**:

- Browser storage. **Rejected** for the reason above. Note this does not contradict the product's
  existing rule that browser storage holds only ephemeral interface state: that rule exists because
  configuration in browser storage made two people run different rules invisibly. A draft is
  work-in-progress, not configuration, and it changes no number.
- No persistence at all. **Rejected**: activating the relay navigates the operator away from the
  page, so losing the draft on navigation would make the two features hostile to each other.

## 4. Does the assistant reliably return the configured sections?

**Assumption**: it usually will, and the product must be correct when it does not.

**Rationale**: There is no assistant API and therefore no way to constrain output. The predecessor
handles this by re-emitting every section in canonical order after parsing, inserting a validation
marker where a section is missing, and doing so idempotently — a normalisation step, not a trust
step. That approach is sound and this feature adopts it, with the section list coming from
configuration rather than from a source module.

**Fallback if the assumption proves wrong in use**: the normaliser already produces a complete,
correctly-ordered description from a partial reply, so a poor reply degrades to a draft with visible
validation markers rather than to a failure. If markers appear on most sections in practice, the
remedy is prompt wording, which is configuration-adjacent and cheap to change — not a code change.

## Settled without research

- **The assistant round trip** reuses the shipped prompt-pack machinery: one schema generates both
  the required reply shape and the parser, so the two cannot drift. Chunking, the issue-key
  whitelist, the pack-identifier rejection and the unparseable count all already exist and are
  tested.
- **The write path** reuses `buildChangeSet`, its blocker gate and its was-to-will-be diff, so
  FR-037 and FR-038 are satisfied by the pipeline the hygiene fixes already use rather than by new
  code. The write journal is unbypassable because the proxy remains the one door to Jira.
- **The readiness assessment** runs the shipped checks against the draft. No new check machinery.
