// detailedIssue.test.ts — Proves the one null that carries weight.
//
// `changelog: null` means the history was not retrieved. `changelog: []` means
// the issue genuinely has no history. Collapsing the two is how the predecessor
// turned a missing fetch into a confident zero, so the distinction is asserted
// here rather than left to the reader's discipline.

import { describe, expect, it } from "vitest";

import {
  hasRetrievedChangelog,
  normaliseRawIssue,
} from "../src/model/detailedIssue.js";

/** A raw Jira issue as the search endpoint returns it, trimmed to what we read. */
function buildRawIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "10101",
    key: "ENCUC-1142",
    fields: {
      summary: "Enrollment eligibility rules",
      issuetype: { name: "Story" },
      status: { id: "3", name: "In Progress", statusCategory: { key: "indeterminate" } },
      project: { key: "ENCUC" },
      created: "2026-06-01T09:00:00.000+0000",
      resolutiondate: null,
      assignee: { accountId: "acc-1", name: "jsmith" },
      customfield_10236: 5,
    },
    ...overrides,
  };
}

describe("normaliseRawIssue", () => {
  it("reads the identity and status fields Jira always provides", () => {
    const issue = normaliseRawIssue(buildRawIssue(), {});

    expect(issue.key).toBe("ENCUC-1142");
    expect(issue.issueTypeName).toBe("Story");
    expect(issue.statusName).toBe("In Progress");
    expect(issue.statusCategoryKey).toBe("indeterminate");
    expect(issue.projectKey).toBe("ENCUC");
  });

  it("keeps custom fields addressable by their Jira id and never by a guess", () => {
    const issue = normaliseRawIssue(buildRawIssue(), {});

    expect(issue.fields.get("customfield_10236")).toBe(5);
    expect(issue.fields.has("customfield_10028")).toBe(false);
  });

  it("treats an absent assignee as unassigned rather than as an empty name", () => {
    const raw = buildRawIssue();
    (raw.fields as Record<string, unknown>).assignee = null;

    expect(normaliseRawIssue(raw, {}).assigneeAccountId).toBeNull();
  });

  it("records field names from expand=names so a reader can see which field was read", () => {
    const issue = normaliseRawIssue(buildRawIssue(), { customfield_10236: "Story Points" });

    expect(issue.fieldNames.get("customfield_10236")).toBe("Story Points");
  });
});

describe("changelog availability", () => {
  it("reports history as NOT retrieved when the changelog is null", () => {
    const raw = buildRawIssue();
    const issue = normaliseRawIssue(raw, {});

    expect(issue.changelog).toBeNull();
    expect(hasRetrievedChangelog(issue)).toBe(false);
  });

  it("reports history as retrieved when the changelog is present but empty", () => {
    const raw = buildRawIssue({ changelog: { histories: [] } });
    const issue = normaliseRawIssue(raw, {});

    expect(issue.changelog).toEqual([]);
    expect(hasRetrievedChangelog(issue)).toBe(true);
  });

  it("distinguishes an unretrieved changelog from an empty one", () => {
    const withoutHistory = normaliseRawIssue(buildRawIssue(), {});
    const withEmptyHistory = normaliseRawIssue(buildRawIssue({ changelog: { histories: [] } }), {});

    expect(withoutHistory.changelog).toBeNull();
    expect(withEmptyHistory.changelog).not.toBeNull();
    expect(hasRetrievedChangelog(withoutHistory)).not.toBe(hasRetrievedChangelog(withEmptyHistory));
  });

  it("orders changelog entries oldest first, whatever order Jira returned them in", () => {
    const raw = buildRawIssue({
      changelog: {
        histories: [
          { created: "2026-07-02T10:00:00.000+0000", author: null, items: [] },
          { created: "2026-06-30T10:00:00.000+0000", author: null, items: [] },
          { created: "2026-07-01T10:00:00.000+0000", author: null, items: [] },
        ],
      },
    });

    const entries = normaliseRawIssue(raw, {}).changelog ?? [];

    expect(entries.map((entry) => entry.atIso)).toEqual([
      "2026-06-30T10:00:00.000+0000",
      "2026-07-01T10:00:00.000+0000",
      "2026-07-02T10:00:00.000+0000",
    ]);
  });

  it("keeps only the changelog item fields the flow engine reads, unparsed", () => {
    const raw = buildRawIssue({
      changelog: {
        histories: [
          {
            created: "2026-07-01T10:00:00.000+0000",
            author: { accountId: "acc-2" },
            items: [{ field: "status", fromString: "To Do", toString: "In Progress", from: "1", to: "3" }],
          },
        ],
      },
    });

    const entry = (normaliseRawIssue(raw, {}).changelog ?? [])[0];

    expect(entry?.authorAccountId).toBe("acc-2");
    expect(entry?.items[0]).toMatchObject({
      field: "status",
      fromString: "To Do",
      toString: "In Progress",
    });
  });
});
