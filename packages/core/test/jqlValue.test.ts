// jqlValue.test.ts — A query must be the query the user thinks it is.
//
// The whole product rests on handing someone a JQL string and saying "run this
// yourself". A value that escapes its own literal produces a different query
// from the one displayed, which would make that offer a lie.

import { describe, expect, it } from "vitest";

import { buildIssueKeyClause, combineJql, escapeJqlValue } from "../src/jira/jqlValue.js";
import { createCloudAdapter } from "../src/jira/cloudAdapter.js";

describe("escapeJqlValue", () => {
  it("leaves an ordinary value untouched", () => {
    expect(escapeJqlValue("Ready for QA")).toBe("Ready for QA");
  });

  it("escapes a quote so the value cannot close its own literal", () => {
    expect(escapeJqlValue('say "hello"')).toBe('say \\"hello\\"');
  });

  it("escapes a backslash", () => {
    expect(escapeJqlValue("path\\to\\thing")).toBe("path\\\\to\\\\thing");
  });

  it("escapes backslashes before quotes, so an escaped quote stays one character", () => {
    // Naively replacing quotes first would turn \" into \\" and change its meaning.
    expect(escapeJqlValue('a\\"b')).toBe('a\\\\\\"b');
  });
});

describe("buildIssueKeyClause", () => {
  it("renders a key list as an in clause", () => {
    expect(buildIssueKeyClause(["ENCUC-1", "ENCUC-2"])).toBe('key in ("ENCUC-1", "ENCUC-2")');
  });

  it("returns null for an empty list rather than a clause matching nothing", () => {
    // `key in ()` is invalid JQL; returning null forces the caller to decide
    // what an empty set means rather than emitting a query that errors.
    expect(buildIssueKeyClause([])).toBeNull();
  });
});

describe("combineJql", () => {
  it("parenthesises the scope so its OR cannot swallow the condition", () => {
    const combined = combineJql("project = A OR project = B", "status = Done");

    expect(combined).toBe("(project = A OR project = B) AND status = Done");
  });

  it("returns the condition alone when there is no scope", () => {
    expect(combineJql("   ", "status = Done")).toBe("status = Done");
  });
});

describe("the Cloud adapter", () => {
  it("refuses rather than half-working, because a partial adapter would mislead", () => {
    const adapter = createCloudAdapter({} as never);

    expect(() => adapter.probeCapabilities()).toThrow(/not supported yet/i);
  });

  it("names the differences that would change results, not merely requests", () => {
    const adapter = createCloudAdapter({} as never);

    expect(() => adapter.fetchFieldCatalogue()).toThrow(/change history capped at 100/i);
  });
});
