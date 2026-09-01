# Contract: Prompt Packs and the Assistant Round Trip

**Modules**: `packages/core/src/packs/promptPack.ts`, `packRegistry.ts`, `buildPromptChunks.ts`,
`parsePackReply.ts`, `extractJsonPayload.ts`, `packs/definitions/*.ts`
**Satisfies**: FR-032 – FR-041, FR-035A

The assistant is **Microsoft Copilot in a browser**. There is no programmatic interface, no system
prompt, no structured-output mode, and no way to regression-test a reply. Everything in this contract
follows from that: the tool controls what it sends and what it accepts, and nothing else.

---

## 1. One declaration replaces sixteen

The predecessor grew sixteen hand-written `build<X>Prompt` / `parse<X>Reply` pairs over one envelope,
one gate and one panel. Each pair could drift from its own partner, and several did.

```ts
interface PromptPack {
  packId: string;                    // also the reply's guard
  title: string;
  purpose: string;                   // shown to the user AND to the assistant
  isEligibleIssue: (issue: DetailedIssue, context: PackContext) => boolean;
  promptConcepts: readonly ConceptId[];
  instruction: string;               // fixed, reviewed once
  itemSchema: PackItemSchema;        // ← declared ONCE
  toProposals: (item: ValidatedItem, issue: DetailedIssue) => readonly Proposal[];
}
```

**`itemSchema` generates both the prompt's required-shape section and the reply validator.** They
cannot disagree, because there is one declaration. That is the structural claim of this contract and
the reason a new pack is a small file rather than a new surface.

```ts
type PackFieldSpec =
  | { name: string; kind: 'text';    maxLength: number }
  | { name: string; kind: 'enum';    allowedValues: readonly string[] }
  | { name: string; kind: 'number';  min?: number; max?: number }
  | { name: string; kind: 'boolean' }                    // tri-state on the way back
  | { name: string; kind: 'issueKeyList' };
```

---

## 2. Building the prompt

```ts
function buildPromptChunks(
  pack: PromptPack,
  issueSet: IssueSet,
  options: { budgetCharacters: number; userQuestion?: string },
): PromptChunkSet;
```

**Rendering rules** — all inherited from the predecessor's best module, whose conventions were sound:

| # | Rule | Why |
|---|---|---|
| P-1 | An absent value renders as `(none in Jira)`, never omitted | An empty label invites the assistant to invent content |
| P-2 | Every chunk states the issue keys it covers, explicitly | The whitelist is the ingest guard |
| P-3 | Enumerations are listed exhaustively in the prompt | The assistant cannot pick a value the tool will then reject |
| P-4 | The required reply shape is emitted from `itemSchema` | Prompt and parser cannot drift |
| P-5 | The instruction says to answer "no data" rather than guess | A guess is indistinguishable from an answer |
| P-6 | `userQuestion` is appended for the free-form pack, never replacing the instruction | The contract survives whatever the user asks |

---

## 3. Chunking — load-bearing, not cosmetic

Copilot's input box accepts roughly **18,000 characters**, and full issue content is permitted. A
forty-issue set with real descriptions and comments therefore runs to several parts. Multi-part is the
normal case, not an edge case.

```ts
interface PromptChunk {
  index: number;                 // 1-based
  total: number;
  text: string;                  // paste-ready, self-contained
  issueKeyWhitelist: readonly string[];
  characterCount: number;
  state: 'pending' | 'copied' | 'returned';
}

interface PromptChunkSet {
  chunks: readonly PromptChunk[];
  untransferableKeys: readonly string[];
  budgetCharacters: number;
}
```

| # | Rule |
|---|---|
| C-1 | Division happens on **issue boundaries only**. Never within an issue (FR-035). |
| C-2 | Each chunk is independently complete: full instruction, own whitelist, own position. |
| C-3 | The default budget sits **below 18,000**, leaving room for the user's appended question. |
| C-4 | An issue whose own detail exceeds the budget is reported in `untransferableKeys` and skipped — never split, never silently dropped (FR-035A). |
| C-5 | `total` is displayed **before** the user copies anything, so a five-part job is known to be five parts at the start. |
| C-6 | `state` is tracked per chunk and shown. |

**C-6 is the one that matters.** With multi-part as the norm, the only thing standing between a
half-answered run and a result that reads as complete is per-chunk tracking. A result assembled from
three of five chunks is labelled as covering three of five, and its `Measure` is `isPartial`.

---

## 4. Reading the reply

```ts
function parsePackReply(
  pack: PromptPack,
  replyText: string,
  chunk: PromptChunk,
  issueSet: IssueSet,
): PackReplyResult;
```

`extractJsonPayload` is lifted verbatim: strips code fences, slices first `{` to last `}`, repairs the
three recurring defects (unescaped inner quotes, raw control characters in strings, trailing commas),
and is a strict no-op on already-valid JSON.

### Envelope

```json
{ "packId": "fix-acceptance-criteria", "chunk": 2, "of": 5,
  "items": [ { "key": "ENCUC-142", "acceptanceCriteria": "...", "isReady": null } ] }
```

### The validation ladder

| Condition | Action | Requirement |
|---|---|---|
| `packId` absent or ≠ pack | **Reject the whole reply**, naming the mismatch | FR-037 |
| `chunk` ≠ the chunk being ingested | Accept with an explicit warning | — |
| Key not in `issueKeyWhitelist` | Drop the item, collect into `unknownKeys`, **show it** | FR-036 |
| Value outside a declared enum | `null` — never a nearest match | FR-039 |
| Field omitted entirely | `null`, meaning *no opinion* | FR-038 |
| Boolean field | Tri-state `boolean \| null` | FR-038 |
| Text over `maxLength` | Truncate and flag, never silently | — |
| Duplicate key | Last wins, flagged | — |
| Still unparseable | Increment `unparsedCount`, never discard silently | FR-040 |

```ts
interface PackReplyResult {
  proposals: readonly Proposal[];
  unknownKeys: readonly string[];
  unparsedCount: number;
  duplicateKeys: readonly string[];
  truncatedFields: readonly { key: string; field: string }[];
  rejection: { kind: 'wrong-pack' | 'unreadable' | 'wrong-envelope'; detail: string } | null;
}
```

**Every field of this result is rendered.** The counts of what was dropped, invented, or unreadable
are part of the answer, not diagnostics hidden behind a log. A round trip that quietly discarded four
items is a round trip whose output cannot be trusted.

### Why omission is `null` and not `false`

An assistant that does not mention a checkbox has not decided it should be unticked. Coercing silence
to `false` lets an assistant clear a value a person deliberately set — a write nobody requested,
caused by the assistant saying nothing at all.

---

## 5. The packs in this feature

| `packId` | Kind | Subjects | Produces |
|---|---|---|---|
| `ask-anything` | Free-form | Any retrieved set | Text answer; **no proposals, no writes** |
| `fix-acceptance-criteria` | Fix | Issues flagged by that check | Acceptance criteria text |
| `fix-thin-description` | Fix | Issues with a short description | Rewritten description |
| `delivery-narrative` | Read-only | The flow measures | A paragraph for a status update |

Deterministic fixes — `set-missing-fix-version`, `align-out-of-sync-dates` — are **not** prompt packs.
They need no assistant, produce the same reviewable change set, and are the fastest path to someone
using the tool without authoring anything (FR-047).

**`ask-anything` is the day-one pack.** It is the user's own described workflow: paste JQL, get every
detail, get a prompt, add your question, paste the answer back. It writes nothing, so it is useful
before any mapping is configured and before any write path is trusted.

---

## 6. Nothing applies itself

```ts
function PackPanel(props: {
  pack: PromptPack;
  issueSet: IssueSet;
  onAccept: (proposals: readonly Proposal[]) => void;
}): JSX.Element;
```

The panel builds prompts, tracks chunks, parses replies, and shows results. **It never writes.**
`onAccept` hands proposals to the owning surface, which builds a change set and shows a diff before
anything is sent (FR-041).

There is **no gate** on any of this. The predecessor hid AI features behind a keyboard shortcut and a
client-side hash of the word "unlock" — friction that protected nothing and, on a tool with an
adoption problem, cost more than it saved.
