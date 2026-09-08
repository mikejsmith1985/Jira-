// loadIssueIntoDraft.test.ts — The moment a silent rewrite is created or avoided.
//
// `loadedFieldValues` is captured here, once. Every later save compares against
// it, so a description the operator never touched produces no write. Comparing
// against anything else — a normalised form, a default, the field's current
// shape — rewrites text nobody edited, and nothing on screen would report it.
// The predecessor hit exactly this: headings in an untouched rich description
// came back as "1. 1." lists after a save.
//
// The other decision made here is which create screen applies. When enriching,
// the project and type are the LOADED ISSUE'S own. The operator does not choose
// them, because moving an issue between projects is not this feature — and
// leaving that unstated would let two implementations disagree about which
// fields even exist.

import { describe, expect, it } from "vitest";

import { buildEmptyDraft } from "../src/authoring/draft.js";
import {
  describeLoadFailure,
  loadIssueIntoDraft,
  readLoadResult,
} from "../src/authoring/loadIssueIntoDraft.js";

const NOW = "2026-09-08T09:14:00.000Z";

/** Jira's answer for one issue, as the adapter hands it over. */
function buildRawIssue(overrides: Record<string, unknown> = {}) {
  return {
    key: "ENCUC-1142",
    fields: {
      project: { key: "ENCUC" },
      issuetype: { id: "10001", name: "Story" },
      summary: "Show enrolment status",
      description: "A one-line stub.",
      customfield_10500: { value: "Run" },
      ...overrides,
    },
  };
}

/** Loads that issue into an empty draft. */
function loadIt(rawIssue = buildRawIssue()) {
  const result = readLoadResult({
    issueKey: "ENCUC-1142",
    statusCode: 200,
    rawIssue,
    jiraMessages: [],
  });
  if (result.status !== "loaded") throw new Error("expected a loaded issue");

  return loadIssueIntoDraft({
    draft: buildEmptyDraft(NOW),
    issue: result.issue,
    summaryFieldId: "summary",
    descriptionFieldId: "description",
    acceptanceCriteriaFieldId: "customfield_ac",
    nowIso: NOW,
  });
}

describe("bringing an issue in", () => {
  it("fills the draft from the issue's real values", () => {
    const draft = loadIt();

    expect(draft.summary).toBe("Show enrolment status");
    expect(draft.description).toBe("A one-line stub.");
  });

  it("sets the key, which is what makes this an update", () => {
    expect(loadIt().existingIssueKey).toBe("ENCUC-1142");
  });

  it("takes the project and type from the issue, not from a choice", () => {
    // Moving an issue between projects or types is not this feature. Leaving
    // this unstated would let two implementations disagree about which fields
    // exist for the draft.
    const draft = loadIt();

    expect(draft.projectKey).toBe("ENCUC");
    expect(draft.issueTypeId).toBe("10001");
  });

  it("captures every value the issue held, including ones no box shows", () => {
    // A save compares against these. A field absent from here would read as
    // changed the moment anything touched it.
    const draft = loadIt();

    expect(draft.loadedFieldValues?.customfield_10500).toEqual({ value: "Run" });
  });

  it("keeps a field it cannot render as text out of the visible boxes", () => {
    // An option is not a string. Putting "[object Object]" in a textarea and
    // then saving it would be a rewrite disguised as a load.
    const draft = loadIt(buildRawIssue({ description: { some: "rich object" } }));

    expect(draft.description).toBe("");
  });

  it("leaves the operator's own words alone, since they are not the issue's", () => {
    const withNarrative = { ...buildEmptyDraft(NOW), operatorNarrative: "Jana asked for this." };
    const result = readLoadResult({
      issueKey: "ENCUC-1142",
      statusCode: 200,
      rawIssue: buildRawIssue(),
      jiraMessages: [],
    });
    if (result.status !== "loaded") throw new Error("expected a loaded issue");

    const draft = loadIssueIntoDraft({
      draft: withNarrative,
      issue: result.issue,
      summaryFieldId: "summary",
      descriptionFieldId: "description",
      acceptanceCriteriaFieldId: null,
      nowIso: NOW,
    });

    expect(draft.operatorNarrative).toBe("Jana asked for this.");
  });
});

describe("when the issue cannot be brought in", () => {
  it("says a missing key is a missing key, and stays set to create", () => {
    const result = readLoadResult({
      issueKey: "ENCUC-9999",
      statusCode: 404,
      rawIssue: null,
      jiraMessages: [],
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(describeLoadFailure(result.failure)).toContain("still set to create a new issue");
  });

  it("does not claim the issue is missing when the account simply cannot see it", () => {
    const result = readLoadResult({
      issueKey: "DENP-1",
      statusCode: 403,
      rawIssue: null,
      jiraMessages: [],
    });

    if (result.status !== "failed") throw new Error("expected a failure");
    expect(result.failure.kind).toBe("not-permitted");
    expect(describeLoadFailure(result.failure)).toContain("cannot open");
  });

  it("reports our own inability to reach Jira as ours, not as a refusal by Jira", () => {
    const result = readLoadResult({
      issueKey: "ENCUC-1",
      statusCode: 0,
      rawIssue: null,
      jiraMessages: ["No Jira tab is relaying."],
    });

    if (result.status !== "failed") throw new Error("expected a failure");
    expect(describeLoadFailure(result.failure)).toContain("Jira+ could not reach Jira");
  });

  it("survives an issue Jira described oddly, rather than throwing", () => {
    // A missing project or type is not worth failing a load over; the blockers
    // will catch what actually matters before anything is written.
    const result = readLoadResult({
      issueKey: "ENCUC-1",
      statusCode: 200,
      rawIssue: { key: "ENCUC-1" },
      jiraMessages: [],
    });

    expect(result.status).toBe("loaded");
  });
});
