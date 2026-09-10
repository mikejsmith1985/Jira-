// renderIssueForPrompt.test.ts — An answer is only as good as what was sent.
//
// Asked "which of these tickets may not be in the right status", the assistant
// answered null for issue after issue. It was right to. The prompt carried the
// key, the type, the status, the summary and the description — and nothing
// else. No comments, no assignee, no dates, no history. The evidence that
// decides whether a status is wrong is exactly what was left behind, and half
// of it had already been retrieved and was being discarded on the way out.
//
// So these assertions are about the material, not the wording: what a reader
// would have to see to answer, the assistant has to see too. And where
// something was NOT sent, the prompt says so — an assistant that cannot tell
// the difference between "no comments" and "comments withheld" will fill the
// gap in.

import { describe, expect, it } from "vitest";

import { renderIssueForPrompt } from "../src/packs/buildPromptChunks.js";
import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildDefaultWorkspaceConfiguration } from "../src/workspace/workspaceConfig.js";
import type { PackContext, PromptPack } from "../src/packs/promptPack.js";

const PACK: PromptPack = {
  packId: "ask-anything",
  title: "Ask",
  purpose: "Answer.",
  isEligibleIssue: () => true,
  promptConcepts: [],
  instruction: "Answer for each issue.",
  itemSchema: { fields: [{ name: "answer", kind: "text", maxLength: 200, description: "An answer" }] },
  toProposals: () => [],
};

/** One issue, with whatever fields the case is about. */
function buildIssue(fields: Record<string, unknown>, changelog: unknown = undefined) {
  return normaliseRawIssue({
    key: "ENCUC-2113",
    id: "1",
    fields: {
      summary: "SF - THUB reverting status back to Submitted",
      issuetype: { name: "Defect" },
      status: { id: "3", name: "Working", statusCategory: { key: "indeterminate" } },
      project: { key: "ENCUC" },
      created: "2026-08-01T09:00:00.000Z",
      ...fields,
    },
    ...(changelog === undefined ? {} : { changelog }),
  }, {});
}

/** Renders one issue the way a prompt part would. */
function render(fields: Record<string, unknown>, changelog?: unknown): string {
  const context = {
    issueSet: null,
    fieldMap: buildDefaultWorkspaceConfiguration("2026-09-01T00:00:00.000Z").fieldMap,
    readConcept: () => null,
  } as unknown as PackContext;
  return renderIssueForPrompt(buildIssue(fields, changelog), PACK, context);
}

describe("the comments", () => {
  it("are in the prompt, because that is where the reason usually is", () => {
    // The single largest omission. A status argument is settled in the comments
    // far more often than in the description.
    const text = render({
      comment: {
        comments: [
          { author: { displayName: "A Tester" }, created: "2026-09-01T10:00:00.000Z", body: "Failed in SYS, moving back." },
        ],
      },
    });

    expect(text).toContain("Failed in SYS, moving back.");
    expect(text).toContain("A Tester");
  });

  it("says there are none, rather than leaving a silence to be filled", () => {
    expect(render({ comment: { comments: [] } })).toContain("Comments: (none in Jira)");
  });

  it("says when they were not retrieved at all, which is a different thing", () => {
    // "No comments" and "comments not fetched" support opposite conclusions.
    expect(render({})).toContain("not retrieved");
  });

  it("keeps the most recent ones when there are too many to send", () => {
    const comments = Array.from({ length: 12 }, (unused, index) => ({
      author: { displayName: "Someone" },
      created: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      body: `Comment number ${index + 1}`,
    }));

    const text = render({ comment: { comments } });

    expect(text).toContain("Comment number 12");
    expect(text).not.toContain("Comment number 1 ");
    expect(text).toMatch(/earlier comments not shown/i);
  });
});

describe("the status history", () => {
  it("shows how the issue reached the status it is in", () => {
    // The question was whether a status is right. That cannot be answered from
    // the status alone - only from how and when it got there.
    const text = render({}, {
      histories: [
        {
          created: "2026-09-05T10:00:00.000Z",
          items: [{ field: "status", fromString: "Ready for Testing", toString: "Working" }],
        },
      ],
    });

    expect(text).toContain("Ready for Testing");
    expect(text).toContain("Working");
    expect(text).toContain("2026-09-05");
  });

  it("says it was not retrieved rather than implying the issue never moved", () => {
    expect(render({})).toMatch(/history was not retrieved/i);
  });
});

describe("the fields that were already being fetched and thrown away", () => {
  it("names who it is assigned to", () => {
    expect(render({ assignee: { displayName: "A Developer" } })).toContain("A Developer");
  });

  it("gives the fix version, which is half of any release question", () => {
    expect(render({ fixVersions: [{ name: "26.4" }] })).toContain("26.4");
  });

  it("gives the labels", () => {
    expect(render({ labels: ["regression", "esi"] })).toContain("regression");
  });

  it("gives the parent, so an issue is not read out of its context", () => {
    expect(render({ parent: { key: "DENP-1353" } })).toContain("DENP-1353");
  });

  it("says when it was last touched, which is the whole of a staleness question", () => {
    expect(render({ updated: "2026-09-09T10:00:00.000Z" })).toContain("2026-09-09");
  });
});
