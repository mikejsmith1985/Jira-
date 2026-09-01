# Jira+

A minimally invasive layer over Jira where **every number shows its work**.

You paste a JQL query. Jira+ retrieves every matching issue once — all fields,
full change history — and freezes it. Everything else is a lens over that one
snapshot: the flow charts, the quality checks, the prompts you paste into
Copilot. No lens goes back and asks Jira a second question.

That single restriction is the whole design. A query naming a field that does not
exist cannot quietly become a green score, because there is no second query left
to go wrong.

---

## Why it exists

Its predecessor works, and nobody uses it. It reached 33 surfaces and adoption
never came, because the numbers could not be checked and so were not believed.
Three behaviours explain the whole failure:

- **A wrong field reference returned nothing, and nothing rendered as a perfect
  score.** Failure and success looked identical.
- **A displayed `0` meant three different things** — all clear, nothing applies,
  or the field could not be found — drawn identically.
- **Rule configuration lived in one browser storage key**, so two people ran
  different checks and neither was told.

Jira+ makes each of those impossible rather than fixed.

---

## What it does

| Surface | What you get |
|---|---|
| **Query** | Paste JQL, see every match, and a receipt saying exactly what was retrieved. Then a ready-made prompt for Copilot with your own question on the end. |
| **Flow** | Weekly throughput, cycle-time percentiles, and what is ageing now — all from issue history, with no sprint anywhere in the calculation. Two definitions of "finished", both reproducible in Jira. |
| **Hygiene** | Checks reporting *N of M*. A check that cannot run says so; it never turns green. |
| **Changes** | Everything Jira+ ever wrote, with its outcome. |
| **Setup** | Confirm which Jira field is which by seeing a real value from your own issue. |

---

## Getting started

**You need**: Node.js 20 or later, and a Jira Data Center personal access token.
That is the entire list.

```powershell
npm install
npm run build
npm run dev
```

Open `http://localhost:5555`, add your Jira URL and token, and paste a query.
Nothing else needs configuring before something works.

### Commands

```powershell
npm test            # unit tests: fully mocked, under 10ms each
npm run test:contract   # integration tests against recorded Jira fixtures
npm run lint
npm run build
```

To refresh the integration fixtures from your own instance:

```powershell
node packages/server/test/fixtures/record.js
```

---

## How it is built

Three npm workspaces, and the important one is `core`.

```
packages/core     Every rule, compiled once for BOTH the browser and Node
packages/server   Express host that injects the Jira credential server-side
packages/client   React surfaces. Holds no rules.
```

`core` compiling for both runtimes is the load-bearing decision. The
predecessor's worst structural defect was a hand-written server port of its
client rules, guarded by a parity test that compared identifiers and never logic;
it carried five divergences at once, so the emailed digest and the interactive
screen could disagree about the same issues, and did. One compiled engine makes
that impossible rather than tested for.

### The rules that hold it together

Each is enforced by a test that reads the source, because the predecessor's
defects were not written by careless people — they were written by people
following the surrounding code.

- A quantity is never a bare number. It is a `Measure`, whose constructor refuses
  to return a passing state when the population is empty or the data never
  arrived.
- **There is no `count` field.** A count is the length of the array the
  drill-through renders, so a number and its links cannot disagree.
- No check may issue a Jira query, and no rule may name a `customfield_` id.
- **No default Jira field id ships anywhere.** A hardcoded default was wrong for
  this instance and reported clean zeros for months. The tool may be
  unconfigured; it may not be confidently wrong.
- No file under `flow/` may contain the word "sprint".
- A check is one declaration in one file, and the catalogue derives from the
  registry — so a check cannot be evaluated without appearing, or appear without
  being evaluated.

### The constraints it was built under

API access to Jira only. No AI keys, no browser extension, no Jira plugin, and no
project admin rights. The assistant is Microsoft Copilot in a browser, reached by
copy and paste, with an input box of about 18,000 characters — which is why
dividing a prompt is the normal case here and every part's state is tracked.

---

## Working on it

Read `.specify/memory/constitution.md` first; it is binding. Specifications live
under `specs/`, and `CHANGELOG.md` is the single record of what changed.

Branches follow GitHub Flow (`feature/*`, `fix/*`, `chore/*`, `docs/*`), and the
failing test is written before the implementation.
