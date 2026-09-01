# Feature Specification: Board-Native Roll-Up

**Feature Branch**: `feature/board-native-rollup`

**Feature Directory**: `specs/002-board-native-rollup`

**Created**: 2026-09-01

**Status**: Draft

**Input**: The Roll-Up Board is the surface the user likes most and trusts least. He wants Feature
swimlanes over **his real Jira board**, not a parallel tool — but his workflow carries more
resolution than Jira board columns can express.

---

## Why This Feature Exists

The predecessor's Roll-Up Board is the one surface its author actively likes. It is also the one
that drifted furthest from Jira, and the drift was not carelessness — it was the only way to show
what the team actually does.

**Jira board columns can only be statuses.** This team's workflow needs more than that:

- A **sub-status field** separates internal testing from external QE testing and external BT
  testing. One Jira status, three genuinely different states.
- An **open sub-task** signals that a dev item is in code review rather than merely in progress.
  Code review is not a status at all; it is the presence of a child.

Both are expressible with Jira swimlanes, but that produces a two-axis board several people find
hard to read.

So the predecessor invented its own column vocabulary — names, order, status mappings — stored per
team in browser storage and a Confluence property, and reconciled against nothing. A full search of
that codebase found **zero** calls to Jira's own board-configuration endpoint. Its board is not a
view of a Jira board at all: its scope is whatever the dashboard's sprint selector happened to hold.

**Intended outcome.** The same swimlanes, drawn over the team's real board, with **no column
vocabulary for anyone to maintain**. Jira supplies the columns; Jira+ adds a small, declared,
visible refinement on top of them — and the refinement can never lose a card or invent a column.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my own board, as Jira has it (Priority: P1)

A delivery lead picks their team's Jira board. Jira+ renders that board's own columns, in Jira's own
order, with Jira's own names, and places every issue in the column of its own status. Nothing was
configured to make that happen. An issue whose status belongs to no column appears in a visible
"not on this board" column rather than vanishing.

**Why this priority**: It is the entire premise. Until the columns come from Jira, everything built
on top is another parallel tool — and a parallel tool is what the author is trying to leave behind.

**Independent Test**: Pick a real board and confirm the columns match what Jira shows, in the same
order, without configuring anything.

**Acceptance Scenarios**:

1. **Given** a Jira board the user can view, **When** they select it, **Then** the columns rendered
   are the board's own, in the board's own order, with the board's own names.
2. **Given** the board's configuration, **When** an issue is placed, **Then** it appears in the
   column its current status is mapped to by the board itself.
3. **Given** an issue whose status is mapped to no column, **When** the board renders, **Then** the
   issue appears in an explicit "not on this board" column and is counted there.
4. **Given** a board whose configuration cannot be read, **When** the user selects it, **Then** the
   system says so and renders nothing, rather than falling back to invented columns.
5. **Given** a rendered board, **When** the user asks where the columns came from, **Then** the
   system names the board and states that the columns are Jira's own.

---

### User Story 2 - Feature swimlanes over those columns (Priority: P2)

Each Feature becomes a lane. Its children appear in the lane, each in the column of its own status.
A lane header states the Feature's own progress. Work that belongs to no Feature is gathered in a
visible "no Feature" lane with a live count, so the board never hides anything.

**Why this priority**: This is the shape the author values — the whole picture at once. It depends
on Story 1's columns but adds the arrangement that makes the board worth looking at.

**Independent Test**: Render a real board and confirm every retrieved issue appears exactly once,
in exactly one lane and one column.

**Acceptance Scenarios**:

1. **Given** a set of issues, **When** the board renders, **Then** every issue appears in exactly
   one lane and exactly one column.
2. **Given** an issue with a parent Feature, **When** the board renders, **Then** it appears in that
   Feature's lane.
3. **Given** an issue with no discoverable Feature, **When** the board renders, **Then** it appears
   in the "no Feature" lane, which shows how many it holds.
4. **Given** a Feature with no children in scope, **When** the board renders, **Then** the Feature
   still appears, stated as having no work rather than being omitted.
5. **Given** a lane, **When** its progress is shown, **Then** the figure is a Measure that can be
   opened to exactly the issues behind it.
6. **Given** a filter applied to the board, **When** lane headline figures are shown, **Then** they
   describe the unfiltered lane, and say so.

---

### User Story 3 - The resolution Jira columns cannot express (Priority: P3)

Within a column, the user can declare a split: a field's values become labelled bands inside that
column, so internal test, external QE test and external BT test are visibly different without
becoming different columns. Separately, an open sub-task matching a declared rule shows as a badge
on the card — because code review is not a status. Anything a band cannot classify stays visible in
an explicit "unclassified" band.

**Why this priority**: This is why the predecessor invented its own vocabulary. Doing it as a
declared refinement — rather than as a replacement — is what keeps the board reconcilable with Jira
while still showing what the team does.

**Independent Test**: Declare a band split on one column and confirm the column's total still equals
Jira's own count for that column, with every card in exactly one band.

**Acceptance Scenarios**:

1. **Given** a refinement on a column, **When** the board renders, **Then** the column shows
   labelled bands, and the sum of the bands equals the column's own total.
2. **Given** a card whose value matches no band, **When** the board renders, **Then** it appears in
   an explicit unclassified band within the same column, never hidden and never moved.
3. **Given** a refined column, **When** it is displayed, **Then** the interface states which Jira
   column it refines and which field it splits by.
4. **Given** a card-marker rule, **When** a card has a matching open sub-task, **Then** the card
   carries a badge — and no column is created for it.
5. **Given** a refinement naming a column that no longer exists on the board, **When** the board
   renders, **Then** the system reports the stale refinement plainly and renders that column
   unrefined with all of its cards.
6. **Given** any refinement, **When** it is authored, **Then** the column is chosen from the live
   board and the field from the resolved mapping — neither can be typed freely.

---

### User Story 4 - Move a card, and know what really happened (Priority: P4)

Dragging a card to another column moves the issue in Jira. Before anything is sent, the system
decides whether the move is possible at all; an impossible move is refused without a request being
made. Where a move needs both a status transition and a field change, and only the transition
succeeds, the card does **not** snap back — because Jira really did change.

**Why this priority**: It turns the board from a report into a place to work. It comes last because
a board nobody trusts is not one anybody wants to drag cards on.

**Independent Test**: Drag a card between columns on a real board, then confirm the issue's status
in Jira independently.

**Acceptance Scenarios**:

1. **Given** a card and a target column, **When** the user begins a drag, **Then** the system
   determines the required action before any request is sent.
2. **Given** a target Jira offers no transition to, **When** the user drops the card, **Then** the
   move is refused, nothing is sent, and the card stays where it was.
3. **Given** a move requiring fields the transition screen demands, **When** the user drops the
   card, **Then** the system asks for those fields before sending anything.
4. **Given** a two-part move whose first part succeeded and second failed, **When** the outcome is
   reported, **Then** the card is **not** returned to its origin, the true current state is shown,
   and the partial failure is named.
5. **Given** any successful move, **When** the change log is opened, **Then** the move appears in it.
6. **Given** a lane belonging to another team's work, **When** the user attempts a drag, **Then** it
   is not a drop target.

---

### Edge Cases

- **The board's configuration is readable but its filter is not.** Reported as a permission problem
  naming what could not be read, never as an empty board.
- **The board has more issues than the retrieval ceiling.** The board renders what was retrieved and
  states that it is incomplete; no lane figure claims to be a total.
- **Two Jira columns carry the same name.** Rendered distinctly and reported, because a user
  choosing a column to refine must be able to tell them apart.
- **An issue's status changes in Jira after retrieval.** The board describes the moment it was
  retrieved, and says when that was; it does not silently poll.
- **A Feature's children span projects the query did not include.** The lane states that its figure
  covers only the retrieved scope.
- **A sub-task matches a card-marker rule on an issue that is itself a sub-task.** Ignored, and the
  rule's own scope is stated.
- **A refinement's field is unmapped.** The column renders unrefined, and the reason is given —
  never silently unsplit.
- **A card is dropped into the band it already occupies.** Recognised as a no-op; nothing is sent.

---

## Requirements *(mandatory)*

### The board is Jira's

- **FR-101**: The system MUST read the selected board's own column configuration from Jira, and MUST
  render those columns, in that order, with those names.
- **FR-102**: The system MUST NOT provide any means of creating, renaming, reordering or deleting a
  column. There is no column vocabulary to maintain.
- **FR-103**: The system MUST place each issue in the column its own status is mapped to by the
  board.
- **FR-104**: An issue whose status is mapped to no column MUST appear in an explicit, visible
  column and MUST be counted there.
- **FR-105**: When the board configuration cannot be read, the system MUST report that and render no
  board, rather than substituting columns of its own.
- **FR-106**: The system MUST state, on the board, which Jira board the columns came from.
- **FR-107**: The board's issues MUST come from one retrieval, carrying the same provenance record as
  every other surface.

### Lanes

- **FR-108**: Each Feature in scope MUST render as one lane, and each issue MUST appear in exactly
  one lane and one column.
- **FR-109**: Work with no discoverable Feature MUST appear in a visible "no Feature" lane showing
  how many issues it holds.
- **FR-110**: A Feature with no children in scope MUST still appear, stated as having no work.
- **FR-111**: Every lane figure MUST be a Measure, openable to exactly the issues behind it.
- **FR-112**: Lane headline figures MUST be computed before any filter is applied, and the interface
  MUST say so.
- **FR-113**: The board MUST NOT truncate its issue set silently; an incomplete retrieval MUST be
  visible on the board itself.

### Refinements

- **FR-114**: Users MUST be able to declare that one Jira column is split into labelled bands by the
  values of one mapped concept.
- **FR-115**: The sum of a column's bands MUST equal that column's own total, and every card MUST
  appear in exactly one band.
- **FR-116**: A card matching no band MUST appear in an explicit unclassified band within the same
  column.
- **FR-117**: The interface MUST state, for every refined column, which Jira column it refines and
  which field it splits by.
- **FR-118**: Users MUST be able to declare a card marker driven by the presence of a matching open
  child issue, and such a marker MUST NOT create a column.
- **FR-119**: A refinement naming a column absent from the live board MUST be reported plainly, and
  that column MUST render unrefined with all of its cards.
- **FR-120**: A refinement whose field is unresolved MUST render the column unrefined and state why.
- **FR-121**: When authoring a refinement, the column MUST be chosen from the live board and the
  field from the resolved mapping; neither may be entered as free text.
- **FR-122**: Refinements MUST be part of the installation's configuration and MUST therefore be
  reflected in its identifier.

### Moving work

- **FR-123**: The system MUST determine what a move requires before sending any request.
- **FR-124**: A move Jira offers no transition for MUST be refused without a request being sent, and
  the card MUST stay where it was.
- **FR-125**: A move requiring fields the transition demands MUST collect them before sending.
- **FR-126**: When a multi-part move partially succeeds, the system MUST NOT revert the card, MUST
  show the issue's true current state, and MUST name what failed.
- **FR-127**: Every move MUST appear in the change log.
- **FR-128**: Read-only lanes MUST NOT accept a drop.
- **FR-129**: A drop onto the card's existing column and band MUST send nothing.

---

### Key Entities

- **Board Spine**: The selected Jira board's own columns and their status mappings, read from Jira
  and never edited. The only column vocabulary in the product.
- **Column Refinement**: A declared, validated delta on top of one spine column — either bands by a
  field's values, or a card marker driven by an open child. It can change how a column is displayed;
  it can never remove a card or create a column.
- **Band**: One labelled division within a column, including the explicit unclassified band that
  catches whatever the declared bands do not.
- **Lane**: One Feature and the work beneath it, plus the "no Feature" lane that makes unattributable
  work visible.
- **Move Plan**: What a drag would require, decided before anything is sent — no action needed, a
  field change, a transition, a transition plus a field change, fields still needed, or refused.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: A user renders their real board with **zero** configuration steps beyond choosing it.
- **SC-102**: The columns rendered match Jira's own board view exactly — same names, same order —
  verified by comparing the two screens.
- **SC-103**: 100% of retrieved issues appear on the board exactly once, verified by automated
  assertion across generated fixtures.
- **SC-104**: For every refined column, the sum of its bands equals the column's own total, with zero
  discrepancy, asserted automatically.
- **SC-105**: A refinement referring to a column that no longer exists never loses a card, verified
  by inducing the condition.
- **SC-106**: A move Jira cannot perform results in zero requests being sent.
- **SC-107**: A user can determine, from the board alone, which Jira board it came from and when it
  was retrieved, in 100% of cases.
- **SC-108**: Adding a refinement requires no change to any code.

---

## Assumptions

- **The user can view the boards they select.** Reading a board's configuration needs board-view
  rights, not administration. No admin rights are assumed anywhere, consistently with feature 001.
- **Feature parentage is discoverable** from the parent-feature concept, an epic link, or Jira's
  native parent, in that order — the same chain the predecessor proved works on this instance.
- **Sub-tasks are retrieved separately** where a card marker needs them, because a board's issue list
  does not include them.
- **The board describes one moment.** It does not poll; it states when it was retrieved and offers a
  refresh.
- **Refinements are few.** This is a small declared delta over Jira's own columns, not a second
  configuration surface. If a team needs many, that is evidence their Jira board is wrong.

---

## Out of Scope

- Cross-project clone families, discipline sub-lanes, and whole-family progress — **feature 003**.
- Creating or editing Jira boards, columns or filters. Jira+ reads a board; it never changes one.
- Sprint-based grouping or reporting of any kind.
- Story-level planning, capacity, or forecasting.
- Bulk moves. A drag moves one card.
