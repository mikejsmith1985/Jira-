# Changelog — Jira+

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **A batch could not be created at all, and Jira had been saying why.** With the refusal finally
  readable, Jira's own words were: *"issuetype: Cannot construct instance of ResourceRef ... from
  String value ('Feature')"* and *"project: project is required"*. Jira's create screen lists
  **project** and **issue type** among its fields, so both were offered as ordinary fields to fill
  in; the assistant duly filled the issue type in with the word `Feature`, and the draft's values
  were then spread **over** the identity the create target had chosen. The project vanished and the
  type became a word. Neither is a field to fill in &mdash; they are what decided which create screen
  this is. They are no longer offered, no longer readable from a draft's values, and are written last
  so nothing can outrank them.

### Changed
- **The assistant is given the material an answer needs.** Asked which issues might be in the wrong
  status, it returned `null` for issue after issue &mdash; correctly, because the prompt carried the
  key, type, status, summary and description and **nothing else**. A status argument is settled in
  the comments far more often than in the description, and comments were never even retrieved.
  Each issue now carries its **comments** (the six most recent, trimmed, with the earlier count
  stated), its **status history**, and the assignee, dates, parent, fix version and labels that were
  already being fetched and thrown away when the prompt was built.
  Where something was not sent, the prompt **says so** &mdash; "not retrieved" and "none in Jira"
  support opposite conclusions, and an assistant that cannot tell them apart fills the gap in. The
  Ask screen now requests status history by default, because every question asked there is a question
  about how an issue got where it is.

### Added
- **A refusal you can act on.** *"Can't you produce an error that would actually help us fix this?"*
  &mdash; and no, it could not, because the two halves that explain a refusal were being discarded
  before anybody saw them. Three fixes were aimed at plausible causes of one 400 before this existed.
  A failed write now carries **what Jira+ sent** and **what Jira said back, verbatim**, under a panel
  that stays closed until it is asked for &mdash; somebody whose summary is too long needs the
  sentence saying so, not a JSON body. One button copies the whole thing in a shape that can be
  pasted into a bug report.
  It also names **which door the request went through**: the relaying Jira tab, or a configured
  token. The two carry the credential differently, so a refusal on one and not the other is the first
  thing worth knowing and the hardest thing to guess from outside. A reply that succeeded is left
  exactly as Jira sent it &mdash; the diagnosis is attached to refusals only.

### Fixed
- **Every write reached Jira with an empty body.** This is the cause of the *"Jira answered with
  status 400"* that no amount of better error reporting could explain: Jira was refusing a create
  with no fields in it, and it was right to. The request body is parsed on the way in, which consumes
  the stream, so piping that stream onward forwarded **nothing** &mdash; and a proxy that quietly
  drops what it is carrying has no symptom on this side of the wire. The parsed body is now what gets
  sent, with its length stated. The proxy's own tests recorded the method, the path and the
  credential of every forwarded request and **never the body**, which is exactly how this passed a
  full suite; they record it now.
- **A refusal Jira did not explain is no longer reported as just a number.** The reply is read as
  text first, so a refusal that is not JSON still has its words, and a single-sentence `message` is
  read alongside `errorMessages` and `errors`. The raw text is a last resort used only when the body
  could not be read at all &mdash; echoing back a JSON object that simply held no reason would be
  noise, not an explanation &mdash; and it is trimmed, because a page of HTML on screen is not a
  message either.

### Changed
- **An update restarts Jira+ by itself.** Installing a new version wrote it to disk, moved the
  pointer, and then asked you to go and launch Jira+ again &mdash; which is the manual step the whole
  update mechanism exists to remove, reappearing at the last moment. Jira+ now hands over to the new
  version on its own and reloads the page when it comes back.
  The handover is done by a small script that outlives both copies, because the process that has to
  wait for the port is the same one that has to release it. It matters that it waits: Jira+ treats a
  port already in use as *"the copy you wanted is already running"* and bows out quietly &mdash;
  right when somebody double-clicks twice, and **silent** here. A new version started too early would
  exit without a word, leaving the machine on the old version with nothing on screen to say so.
  The page waits for the **version** to change, not for the port to answer, because the old copy
  answers right up until it exits. If the handover cannot be done at all &mdash; running from source,
  or no Windows scripting host &mdash; it says so and asks for the restart rather than pretending.
  Nothing stops until a successor is arranged: exiting without one is the only outcome worse than not
  restarting.

### Fixed
- **Jira's own explanation of a refusal is no longer thrown away.** A failed write reported
  *"Jira answered with status 400"* &mdash; the exact uninformative message this product exists to
  eliminate &mdash; because the reader stopped at Jira's `errorMessages` list and never read the
  `errors` object, which is where Jira actually puts *"Issue type is not valid for this project"*.
  Both are read now, and the field each complaint is about is named.
- **The Stories in a batch are created as Stories.** Every item in *A Feature with Stories* was
  created with the one issue type the draft had chosen, so asking for a Feature with three Stories
  created **four Features** &mdash; and on an instance that forbids that shape, Jira refused the
  whole write. The type the issues beneath the Feature are is now asked for, and the batch **refuses
  to write until it has been told** rather than guessing: a wrong guess is only discovered by someone
  opening the board. The assistant is asked for the real type names too, so the prompt describes what
  will actually be created.
- **Pressing the create button visibly does something.** The outcome &mdash; and any refusal
  &mdash; rendered at the top of the page while the button that caused it was at the bottom, so a
  write that had worked looked like nothing had happened. The natural next move is then to press the
  button again, which for a write is the worst possible response to that impression. The outcome now
  sits beside the button and is scrolled into view.
- **The running version is always on screen.** The update notice showed nothing at all when there
  was nothing to install &mdash; correct behaviour that is indistinguishable from a feature that does
  not work, so somebody on the newest version had no way to tell the mechanism was alive and kept
  downloading zips by hand. A small chip in the header now always shows the running version, says
  *offline* when the check could not be made, and becomes the install button when there is something
  newer.

### Added
- **Write several issues from one pile of material.** A toggle on the Author screen: **Just
  Features** turns your material into separate independent issues, or **A Feature with Stories**
  turns it into one parent and the work beneath it, linked. One round trip, however many issues come
  out of it.
  The shape is **your** choice, not the assistant's. A pile of material that could be read either way
  would otherwise come back differently every time it was asked, and nobody would know which reading
  they were getting.
  **A batch that fails halfway does not duplicate on retry.** Six issues is six chances to fail on
  the fifth, and a retry that created the Feature again would leave two Features and three orphaned
  Stories &mdash; invisible until a colleague found the second one. Each created key is recorded on
  its own item as it arrives, and every item carries the **same single switch** a lone draft does: a
  key means update, blank means create. Retrying finishes the batch instead of repeating the half
  that worked. That is the single-issue guarantee applied per item, not a second mechanism that could
  disagree with it.
  In a hierarchy the parent is written first, because a Story cannot be linked to a Feature that does
  not exist yet, and children are linked through the mapped concept rather than a field id written
  down anywhere. Every issue in a reply is validated by the **same function** a lone reply uses, so a
  batch cannot accept a field id or a value a single issue would refuse. A reply proposing more than
  twelve is cut and counted: a list nobody reads is a list nobody checked.
- **A readiness assessment on the Author screen, and it cannot become a refusal.** The shipped
  hygiene checks now run against a draft, read through a projection rather than reimplemented for
  drafts &mdash; a second implementation of every check is precisely how the predecessor acquired
  five live divergences between two rule engines, where a check flagged an issue on one screen and
  passed it on another.
  A readiness finding is a **different type** from a blocking condition and carries no issue key, so
  the compiler refuses to let one be used where the other is required. The panel never wears the
  error tone, never disables anything, and says in words that none of it stops a write; the reasons
  a write is actually refused stay with the diff, in red. Conflating the two is what makes people
  ignore both.
  A check that could not run &mdash; because a concept it needs is unmapped &mdash; is **reported
  with its reason**, never dropped. A check that silently did not run reads exactly like a check
  that passed.
  In the projection, a field the draft has not filled reads as **absent**, not empty, so a check
  sees what it would see on a real issue that never had one. When enriching, the projection starts
  from the loaded issue, so changing a summary does not make every other check report on a blank.
- **The description template is editable in Setup.** Add a section, remove one, reorder them, and
  rewrite the line of guidance that tells the assistant what belongs in each. The next prompt asks
  for exactly what is configured. No restart and no new version of Jira+.
  The nine shipped sections are seed values, not rules, and a button restores them. **An empty
  template is a valid choice** presented as one &mdash; it means descriptions are free-form prose
  &mdash; rather than a state the screen defends against.
  The panel says out loud that changing the template does **not** move the configuration fingerprint,
  and a test now pins that. The fingerprint exists so two people disputing a number can compare eight
  characters; somebody who believed a heading affected it would leave the heading wrong rather than
  risk invalidating a figure they were about to defend.
- **The assistant round trip, on the Author screen.** Build a prompt from your gathered material,
  your own words, the section template and the fields your instance actually offers; copy it into
  Copilot; paste the reply back. Proposals land in the draft where you can change or ignore them,
  and Jira is reached only by the create or save you press afterwards.
  **The prompt cannot ask for what Jira will refuse.** Every field identifier in it comes from the
  create screen for your chosen project and type, and a field with a fixed set of values has those
  values stated. A proposal outside either is dropped **and named** &mdash; a silent drop is
  indistinguishable from the assistant not having proposed it.
  A reply belonging to another prompt is rejected whole rather than partly applied. Content that
  cannot be read is counted and shown. Sections the reply skipped are still written, marked as
  needing validation, so a gap is visible rather than filled with something confident and invented;
  running that normalisation twice changes nothing, so markers cannot accumulate. Any claim that an
  assistant wrote the text is removed &mdash; a marker means information is missing, never a
  disclaimer about authorship.
  A prompt too long for one paste is divided on **source** boundaries, with the head repeated in
  every part, since a part without it is unanswerable. A source too large for a single part is cut
  and **said to be cut**, in the prompt and on screen: silently sending half of somebody's pasted
  brief is the failure that avoids.
- **The section template now lives in the workspace document**, seeded with the current nine
  sections and deliberately outside the fingerprint &mdash; a reworded heading changes no number, and
  folding it in would invalidate the comparison of unrelated figures.
- **Author can now enrich an existing issue.** Put a key in, load it, add what the issue was
  missing, and save. **Only the fields you actually changed are written** &mdash; a save compares
  against what the issue held when it was loaded, never against a normalised or default form, so a
  description you never touched is left byte-identical. That failure has no symptom: the predecessor
  turned headings in untouched rich descriptions into "1. 1." lists on save and nothing reported it.
  The project and issue type come from the **loaded issue's own**, not from a choice. Moving an issue
  between projects or types is not this feature, and leaving that unstated would let two
  implementations disagree about which fields exist.
  Loading is deliberate rather than automatic on typing: half a key is not a key, and asking Jira
  about `ENCUC-11` on the way to `ENCUC-1142` answers confidently about an issue nobody meant. A key
  that does not exist, and one your account cannot see, are reported as different things &mdash; one
  is a typo, the other is a permission to request &mdash; and either way the screen stays set to
  create rather than offering to update nothing.
  Each field is written independently through the pipeline the hygiene fixes already use, so one
  rejection reports Jira's own words without stopping the others, and every write reaches the
  journal.
- **Write a Jira issue with the material in front of you.** A new **Author** surface: gather what you
  are writing from on the left, write the issue on the right, see exactly what will change, create
  it. Two columns and no wizard &mdash; the predecessor spent 2,880 lines on a six-step one in which
  the gathered material was never visible at the same time as the draft, which is the single thing
  that would have helped.
  **One field decides everything.** An existing issue key means that issue will be updated; blank
  means a new one will be created. There is no mode flag and no second path, so the create branch is
  unreachable while a key is set. The test walks generated drafts rather than one example, because
  one example proves only that one path was thought of &mdash; and the failure it prevents, a
  duplicate Feature raised while improving a stub, looks exactly like success until a colleague finds
  two.
  **No field id is written down.** Which fields exist, which the instance requires, and which values
  a select will accept all come from Jira's own createmeta for the chosen project and type. An empty
  field list and a failed read are kept distinct: one means the type has no fields, the other means
  we do not know, and showing them alike would let somebody conclude their issue type is simple while
  Jira was unreachable.
  Gathered material has no field id, so a pasted email cannot become an issue nobody wrote. "Your own
  words" is kept with the draft to steer the assistant and is never written to Jira.
  The draft lives on the server, so it survives a reload, a restart, and the relay bookmarklet
  navigating you away and back. It is discarded only on a create that fully succeeded.
  Writing goes through the existing diff and apply pipeline: nothing reaches Jira without every field
  appearing first with its old value beside its new one, and every write lands in the journal.
  Enriching an existing issue is deliberately refused for now rather than half-built &mdash; the
  screen says so and points at clearing the key.
- **Jira+ needs no token at all.** Every release so far opened by demanding a personal access token,
  and setup has been the worst part of using it. That demand is now removed rather than made easier.
  A bookmarklet, dragged to the bookmarks bar once and clicked on a Jira tab, executes each request
  **inside that tab** with `credentials: "include"`. The credential is therefore the session cookie
  the browser already holds &mdash; the same one that makes Jira work when you click a link. Jira+
  never sees it, never stores it, and there is nothing to create, paste, rotate or revoke; revoking
  access means signing out of Jira.
  The routing is server-side and deliberately so. The proxy remains the **one door** to Jira: when no
  token is configured and a tab is relaying, it forwards through the browser instead. Every existing
  surface &mdash; query, board, flow, hygiene, packs &mdash; works unchanged, and the write journal
  stays impossible to bypass because there is still only one function that reaches Jira.
  Three details carry it. The bookmarklet proves the page by **asking Jira who you are** rather than
  matching a hostname, so it works on any instance and reports the name back as evidence. Every write
  carries `X-Atlassian-Token: no-check`, without which Data Center rejects a cookie-authenticated
  POST as forgery and does not say why. And it keeps polling after Jira+ restarts, because the tab
  never unloaded &mdash; re-clicking after every restart was the most irritating thing about the tool
  this pattern came from.
  The bookmarklet is generated by the server with the server's own port, so one cannot sit in a
  bookmarks bar pointing at the wrong copy. A relay that stops being answered reports **refused**
  rather than staying green: a dropped VPN leaves the tab happily polling while every call returns
  401, and reporting that as connected is a false positive somebody acts on.
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
- **The interface now looks like the tool it sits beside.** Jira+ is a companion to NodeToolbox, and
  looking like a stranger next to it is its own kind of friction. The palette, depth model and
  component shapes are Toolbox's, near-verbatim.
  **Dark is now the default and the operating system is not asked.** The previous build defined a
  complete dark palette and then gated it behind `prefers-color-scheme`, so anyone on a light Windows
  &mdash; which is everyone this was built for &mdash; used it for a week without once seeing the
  theme it was designed in. The choice is explicit, remembered, and stamped on `<html>` before first
  paint so the page never flips after loading.
  Four shapes carry the look, and each earns its place: a **sticky glass top bar** so where you are
  never scrolls away; a **pill tab strip** where the active surface is the only lit thing on the bar;
  **gradient cards that lift on hover** so a panel reads as an object rather than a box; and
  **999px chips** so state is legible at a glance. Depth is a signal, not decoration &mdash; in a dark
  interface height reads as lightness, so raised things get a lighter surface *and* a contact shadow.
  Under `prefers-contrast: more` the depth is stripped and borders carry the signal instead.
  Navigation has icons now, drawn as inline SVG rather than pulled from a package: this ships as one
  executable into an environment with no npm and no CDN, and six glyphs do not justify a dependency.
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
- **The update notice was on a screen nobody had open.** It lived on Setup &mdash; which had also been
  rendering blank &mdash; so updating meant going to GitHub and unzipping by hand, which is exactly
  what the feature existed to stop. An update nobody sees is an update nobody installs. It now
  appears at the top of **every** screen when there is something to install, and says nothing at all
  when there is not: a permanent "you are up to date" in the one place the important message will
  eventually appear trains people to stop reading it. Setup keeps its fuller version, where
  confirming the running version is the reason somebody looked.
- **Pasting a reply took two clicks where one would do.** *Read the reply* announced it had been read
  and waited for *Put these in my draft*. But the draft is not Jira: every proposal in it is still
  editable, and the was-to-will-be diff still stands between it and any write. The second click
  confirmed nothing and cost a step on every round trip. One button now reads the reply and puts it
  in the draft; a reply that is refused whole still applies nothing, which is the case the
  confirmation was really there for.
- **Two test suites raced over one draft file**, so one passed alone and failed in the full run. The
  draft path is overridable now and each suite has its own. A flake nobody can reproduce is worse
  than a failure.
- **The Setup screen rendered nothing at all.** A `workspace.json` written before the description
  template existed has no `descriptionSections`, the new panel mapped over the absence, and React
  unmounted the **entire screen**. The only symptom was a blank page: no message, nothing to act on,
  and no way to reach the connection settings that would have fixed it.
  The schema version did not catch it, because adding a field did not change the version. A document
  is now backfilled on read for any field it predates &mdash; and only where the field is **absent**,
  never where it is empty, because an empty template means *free-form, deliberately* while an absent
  one means *written by a version that had no such idea*.
  Each Setup panel now also renders inside its own boundary, so the next failure of this kind costs
  a panel rather than a screen, and the message names **which** panel and carries the actual reason.
  "Something went wrong" is not something anybody can act on.
- **The agent context stopped describing the product.** `CLAUDE.md` still recorded
  `004-issue-author` as *"PLANNED, not built"* after it had shipped across five releases, and the
  relay &mdash; the reason no personal access token is needed &mdash; was not in it at all. That file
  opens by warning that *"the predecessor's ledger drifted badly enough to mislead a later feature's
  research"*, and it had drifted the same way. Both entries now say what is true, and both sit inside
  the managed block rather than after it.
- **The authoring tests now typecheck, not just pass.** Three assertions indexed arrays TypeScript
  cannot prove are non-empty, and a fetch spy typed from its own zero-argument implementation made
  reading the recorded arguments an error. The suite ran green either way &mdash; the test runner does
  not typecheck &mdash; but the client build does, and a release cannot be cut from a tree that will
  not compile.
- **Jira+ listens on this machine only.** `app.listen(port)` with no host binds *every* interface,
  and that one omission caused two problems. Windows Firewall prompted &mdash; *"do you want to allow
  public and private networks to access this app?"* &mdash; on a program with no business on a
  network at all; loopback-only listeners are exempt from that dialog entirely, so the right answer
  was never to click Allow.
  The second problem had no symptom, which is why it is the more serious one. The proxy attaches the
  operator's Jira personal access token to everything it forwards. Bound to the wildcard, **anyone on
  the corporate network who could reach port 5556 had a credentialled Jira gateway** &mdash; no
  password, no prompt, using someone else's identity. The host is now `127.0.0.1`, explicitly, with a
  test that stops it silently reverting and a startup line that says so out loud.
- **The "Jira+ did not start within 30 seconds" popup.** It fired after *every* launch, while Jira+
  was running perfectly well behind it. The launcher polled with
  `netstat -ano | findstr "127.0.0.1:<port>"`, but the server binds `0.0.0.0` and `[::]`, never the
  literal `127.0.0.1` &mdash; so the string never matched, the poll always failed, and the dialog
  always appeared. It now asks the health route directly, which answers only when the server is
  genuinely serving. Parsing another program's output to infer that was always the indirect route.
- **Every packaged build called itself 0.0.0.** The version was read from `package.json` at a path
  relative to the *source* tree, which does not exist inside the executable, so the fallback won
  every time. That single wrong answer caused the second failure: believing it was 0.0.0, the
  updater treated 0.1.3 as an upgrade, computed its target as `versions .1.3` &mdash; the folder the
  **running** executable lives in &mdash; and tried to copy over itself. Windows refused with `EBUSY`,
  which is exactly what the install-beside-it design exists to prevent. The version is now baked in
  at build time, and the installer refuses to write into the folder it is running from whatever the
  numbers claim.
- **Program Increment reported as absent when it exists.** The field is called
  **"PI (Program Increment)"** on this instance and no expected name matched it. Matching is exact by
  design and stays that way; the list was simply too short. The label is also spelled *Program*, not
  *Programme* &mdash; a label that disagrees with the field it names reads as a different concept.
- **Mojibake in the launcher dialogs.** Em-dashes rendered as `a€"`. Anything a message box shows is
  now plain ASCII.
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
