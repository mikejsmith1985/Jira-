// authoringWrite.test.ts — Nothing is written that was not shown first.
//
// The product's standing rule is that a change reaches Jira only after somebody
// has seen it, field by field, old value beside new. Authoring is not the
// exception, and these assertions hold it there.
//
// Two of them are about honesty when things go wrong rather than when they go
// right. One field being refused must not stop the others, and it must report
// Jira's own words rather than a paraphrase — Jira's message names the data
// policy or the required field, and ours would not. And a failure to reach Jira
// at all must read as OUR inability, never as a refusal by Jira: the first
// version of this product reported "Jira answered with status 503" about a
// request Jira never received, and somebody spent an afternoon hunting an outage
// that did not exist.

import { describe, expect, it, vi } from "vitest";

import { buildAuthoringChangeSet } from "../src/authoring/buildAuthoringChangeSet.js";
import { buildEmptyDraft } from "../src/authoring/draft.js";
import { buildCreateScreenShape } from "../src/authoring/createScreenShape.js";
import { runApplyPlan } from "../src/apply/runApplyPlan.js";
import type { JiraTransport } from "../src/jira/jiraAdapter.js";

const NOW = "2026-09-08T09:14:00.000Z";

/** A shape offering the two fields every issue has. */
const SHAPE = buildCreateScreenShape({
  projectKey: "ENCUC",
  issueTypeId: "10001",
  rawFields: {
    summary: { name: "Summary", required: true },
    description: { name: "Description", required: false },
  },
});

/** A draft enriching an issue, with two fields genuinely changed. */
const ENRICHING = {
  ...buildEmptyDraft(NOW),
  existingIssueKey: "ENCUC-1142",
  summary: "Show enrolment status",
  loadedFieldValues: { summary: "Stub", description: "Old." },
};

/** A transport answering each write however the test needs. */
function buildTransport(answers: Record<string, { statusCode: number; jiraMessages?: string[] }>): JiraTransport {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(async (pathAndQuery: string, body: unknown) => {
      const fieldId = Object.keys((body as { fields?: Record<string, unknown> }).fields ?? {})[0] ?? "";
      const answer = answers[fieldId] ?? { statusCode: 204 };
      return {
        statusCode: answer.statusCode,
        body: null,
        jiraMessages: answer.jiraMessages ?? [],
        retryAfterSeconds: null,
      };
    }),
  } as unknown as JiraTransport;
}

describe("nothing is written that was not shown", () => {
  it("plans exactly the fields the diff will list, and no others", () => {
    // SC-003. The diff renders `plannedChanges`, and the write applies
    // `plannedChanges`. They are the same array, so they cannot disagree.
    const changeSet = buildAuthoringChangeSet({
      draft: ENRICHING,
      shape: SHAPE,
      values: { summary: "Show enrolment status", description: "Old." },
    });

    expect(changeSet.plannedChanges.map((change) => change.fieldId)).toEqual(["summary"]);
  });

  it("writes nothing at all while any blocker stands", async () => {
    const changeSet = buildAuthoringChangeSet({
      draft: { ...ENRICHING, summary: "" },
      shape: SHAPE,
      values: { description: "New." },
    });
    const transport = buildTransport({});

    const outcome = await runApplyPlan(changeSet, transport);

    expect(outcome.appliedCount).toBe(0);
    expect(outcome.refusedReason).toContain("Nothing was written");
    expect(transport.put).not.toHaveBeenCalled();
  });
});

describe("when one field is refused", () => {
  it("still applies the others, rather than abandoning the whole write", async () => {
    const changeSet = buildAuthoringChangeSet({
      draft: ENRICHING,
      shape: SHAPE,
      values: { summary: "Show enrolment status", description: "New." },
    });

    const outcome = await runApplyPlan(
      changeSet,
      buildTransport({ description: { statusCode: 400, jiraMessages: ["Field 'description' cannot be set."] } }),
    );

    expect(outcome.appliedCount).toBe(1);
    expect(outcome.failedCount).toBe(1);
  });

  it("reports Jira's own words, which name the reason ours would not", async () => {
    const changeSet = buildAuthoringChangeSet({
      draft: ENRICHING,
      shape: SHAPE,
      values: { summary: "Show enrolment status", description: "New." },
    });

    const outcome = await runApplyPlan(
      changeSet,
      buildTransport({
        description: {
          statusCode: 400,
          jiraMessages: ["Field 'description' cannot be set. It is not on the appropriate screen."],
        },
      }),
    );

    const failed = outcome.results.find((result) => result.status === "failed");

    expect(failed?.message).toContain("not on the appropriate screen");
  });
});

describe("when Jira cannot be reached at all", () => {
  it("reads as our own inability, never as a refusal by Jira", async () => {
    // The first release reported "Jira answered with status 503" about a request
    // Jira never received, and somebody spent an afternoon hunting an outage
    // that did not exist.
    const changeSet = buildAuthoringChangeSet({
      draft: ENRICHING,
      shape: SHAPE,
      values: { summary: "Show enrolment status" },
    });

    const outcome = await runApplyPlan(
      changeSet,
      buildTransport({
        summary: {
          statusCode: 503,
          jiraMessages: ["Jira+ has no way to reach Jira yet."],
        },
      }),
    );

    const failed = outcome.results.find((result) => result.status === "failed");

    expect(failed?.message).toContain("Jira+");
    expect(failed?.message).not.toMatch(/jira (?:refused|rejected|answered)/i);
  });
});
