// simpleSearch.test.ts — A search anybody can run, that is still one query.
//
// JQL is a real barrier. Most people who need an answer about their own team's
// issues cannot write it, and telling them to learn it is how a tool ends up
// used by one person.
//
// The rule that keeps this honest: the builder produces JQL and SHOWS it. It is
// a way to write the query, never a second way to ask Jira. Everything
// downstream still reads one frozen Issue Set from one query whose exact text
// is on screen and stamped on every result - so a number a beginner produced
// can be checked, re-run, and argued with exactly like anybody else's.
//
// It also means the builder can be wrong out loud. A query nobody can read is a
// query nobody can correct.

import { describe, expect, it } from "vitest";

import { buildJqlFromCriteria, buildEmptyCriteria } from "../src/search/simpleSearch.js";

/** Criteria with only what a case is about. */
function build(overrides: Record<string, unknown> = {}) {
  return { ...buildEmptyCriteria(), ...overrides };
}

describe("with nothing chosen", () => {
  it("asks for nothing rather than for everything", () => {
    // An empty builder that means "every issue in the instance" is a way to
    // retrieve tens of thousands of issues by touching nothing.
    expect(buildJqlFromCriteria(buildEmptyCriteria())).toBe("");
  });
});

describe("projects", () => {
  it("asks for the one that was chosen", () => {
    expect(buildJqlFromCriteria(build({ projectKeys: ["ENCUC"] }))).toContain("project = ENCUC");
  });

  it("asks for any of several", () => {
    expect(buildJqlFromCriteria(build({ projectKeys: ["ENCUC", "DENP"] }))).toContain(
      "project in (ENCUC, DENP)",
    );
  });
});

describe("issue types and statuses", () => {
  it("quotes a name, because plenty of them have spaces in", () => {
    // `type = Sub-task` is a JQL syntax error and `status = Ready for Testing`
    // is three tokens. Quoting is not decoration here.
    expect(buildJqlFromCriteria(build({ issueTypeNames: ["Sub-task"] }))).toContain(
      'type = "Sub-task"',
    );
  });

  it("asks for any of several statuses", () => {
    expect(
      buildJqlFromCriteria(build({ statusNames: ["Working", "Ready for Testing"] })),
    ).toContain('status in ("Working", "Ready for Testing")');
  });

  it("escapes a quote in a name rather than producing a broken query", () => {
    expect(buildJqlFromCriteria(build({ statusNames: ['Say "when"'] }))).toContain(
      'status = "Say \\"when\\""',
    );
  });
});

describe("who it belongs to", () => {
  it("asks for the operator's own issues without naming them", () => {
    // currentUser() works on the relay and with a token alike, and needs no
    // account name written down anywhere.
    expect(buildJqlFromCriteria(build({ assignment: "me" }))).toContain(
      "assignee = currentUser()",
    );
  });

  it("asks for the ones nobody has", () => {
    expect(buildJqlFromCriteria(build({ assignment: "unassigned" }))).toContain(
      "assignee is EMPTY",
    );
  });

  it("says nothing at all when it does not matter", () => {
    expect(buildJqlFromCriteria(build({ assignment: "anyone" }))).toBe("");
  });
});

describe("open or finished", () => {
  it("asks for work that is not done, by Jira's own classification", () => {
    // statusCategory is the one status grouping every instance has, so this
    // works without knowing a single one of this team's status names.
    expect(buildJqlFromCriteria(build({ completion: "open" }))).toContain(
      "statusCategory != Done",
    );
  });

  it("asks for finished work", () => {
    expect(buildJqlFromCriteria(build({ completion: "done" }))).toContain("statusCategory = Done");
  });
});

describe("words", () => {
  it("searches the text of an issue", () => {
    expect(buildJqlFromCriteria(build({ text: "duplicate records" }))).toContain(
      'text ~ "duplicate records"',
    );
  });

  it("ignores whitespace somebody typed and then deleted", () => {
    expect(buildJqlFromCriteria(build({ text: "   " }))).toBe("");
  });
});

describe("when it changed", () => {
  it("asks for recently touched issues in Jira's own relative form", () => {
    expect(buildJqlFromCriteria(build({ updatedWithinDays: 14 }))).toContain("updated >= -14d");
  });

  it("says nothing when no window was chosen", () => {
    expect(buildJqlFromCriteria(build({ updatedWithinDays: null }))).toBe("");
  });
});

describe("the whole query", () => {
  it("joins every choice with AND, in a fixed order so it reads the same twice", () => {
    // A query whose text changes between two identical searches cannot be
    // compared, and comparing is what the provenance stamp is for.
    const jql = buildJqlFromCriteria(
      build({
        projectKeys: ["ENCUC"],
        issueTypeNames: ["Defect"],
        statusNames: ["Working"],
        assignment: "me",
        completion: "open",
        text: "recon",
        updatedWithinDays: 30,
      }),
    );

    expect(jql).toBe(
      'project = ENCUC AND type = "Defect" AND status = "Working" AND statusCategory != Done ' +
        'AND assignee = currentUser() AND text ~ "recon" AND updated >= -30d ' +
        "ORDER BY updated DESC",
    );
  });

  it("orders by what the operator asked for", () => {
    expect(buildJqlFromCriteria(build({ projectKeys: ["ENCUC"], orderBy: "created" }))).toContain(
      "ORDER BY created DESC",
    );
  });

  it("never adds an ORDER BY to a query that asks for nothing", () => {
    expect(buildJqlFromCriteria(buildEmptyCriteria())).toBe("");
  });
});
