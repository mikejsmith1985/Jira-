// paging.test.ts — Where the silent clamp is defeated.
//
// Jira Data Center clamps a page-size request above its configured maximum
// SILENTLY rather than rejecting it: ask for 2,000 with a cap of 1,000 and you
// get 1,000, no error, no warning. A pager that reads a short page as the end of
// the results therefore stops early and reports a confident, wrong total.
//
// That is the same shape of bug as a broken query rendering green, one layer
// down, so the rule is absolute: paging follows Jira's own reported total, never
// the length of the last page.

import { describe, expect, it, vi } from "vitest";

import { fetchIssuesPaged } from "../src/jira/fetchIssuesPaged.js";

/** Builds a page fetcher over a fixed corpus, clamping page size like Jira does. */
function buildPageFetcher(options: {
  totalIssues: number;
  serverPageCap?: number;
  failAtStartAt?: number;
  emptyAtStartAt?: number;
}) {
  const calls: { startAt: number; pageSize: number }[] = [];

  const fetchPage = vi.fn(async (startAt: number, pageSize: number) => {
    calls.push({ startAt, pageSize });

    if (options.failAtStartAt === startAt) {
      return {
        issues: [],
        total: options.totalIssues,
        failure: { kind: "transport" as const, message: "Jira is throttling this client." },
      };
    }

    // Jira clamps the page, not the result set, and says nothing about it.
    const effectivePageSize = Math.min(pageSize, options.serverPageCap ?? pageSize);
    const remaining = Math.max(0, options.totalIssues - startAt);
    const returnedCount =
      options.emptyAtStartAt === startAt ? 0 : Math.min(effectivePageSize, remaining);

    return {
      issues: Array.from({ length: returnedCount }, (_unused, index) => ({
        key: `ENCUC-${startAt + index + 1}`,
      })),
      total: options.totalIssues,
      failure: null,
    };
  });

  return { fetchPage, calls };
}

describe("the silent clamp", () => {
  it("keeps paging when the server returns fewer issues than were requested", async () => {
    // 250 issues, asked for 500 a page, but the server honours only 100.
    const { fetchPage } = buildPageFetcher({ totalIssues: 250, serverPageCap: 100 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 500, ceiling: 2_000 });

    expect(result.issues).toHaveLength(250);
    expect(result.isTruncated).toBe(false);
  });

  it("does not mistake a clamped first page for the whole answer", async () => {
    const { fetchPage, calls } = buildPageFetcher({ totalIssues: 250, serverPageCap: 100 });

    await fetchIssuesPaged(fetchPage, { pageSize: 500, ceiling: 2_000 });

    expect(calls.length).toBeGreaterThan(1);
  });

  it("reports the page size the server actually honoured", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 250, serverPageCap: 100 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 500, ceiling: 2_000 });

    expect(result.observedPageSize).toBe(100);
  });
});

describe("stopping for the right reasons", () => {
  it("stops when everything Jira reported has been fetched", async () => {
    const { fetchPage, calls } = buildPageFetcher({ totalIssues: 150 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.issues).toHaveLength(150);
    expect(calls).toHaveLength(2);
  });

  it("stops at the ceiling and says the answer is incomplete", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 4_317 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.issues).toHaveLength(2_000);
    expect(result.isTruncated).toBe(true);
    expect(result.totalMatchingCount).toBe(4_317);
  });

  it("does not report truncation when the ceiling equals the true total", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 2_000 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.isTruncated).toBe(false);
  });

  it("never fetches beyond the ceiling", async () => {
    const { fetchPage, calls } = buildPageFetcher({ totalIssues: 10_000 });

    await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 250 });

    const largestStartAt = Math.max(...calls.map((call) => call.startAt));

    expect(largestStartAt).toBeLessThan(250);
  });
});

describe("a page that goes wrong is not a page that ran out", () => {
  it("reports a failing page as a failure rather than as the end", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 500, failAtStartAt: 100 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.failure?.kind).toBe("transport");
    expect(result.isTruncated).toBe(true);
  });

  it("keeps the issues retrieved before the failure rather than discarding them", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 500, failAtStartAt: 100 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.issues).toHaveLength(100);
  });

  it("treats an empty page with issues still outstanding as a fault, not an ending", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 500, emptyAtStartAt: 100 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.failure?.kind).toBe("transport");
    expect(result.failure?.message).toMatch(/returned no issues/i);
  });

  it("accepts an empty first page when Jira reports nothing matched", async () => {
    const { fetchPage } = buildPageFetcher({ totalIssues: 0 });

    const result = await fetchIssuesPaged(fetchPage, { pageSize: 100, ceiling: 2_000 });

    expect(result.issues).toHaveLength(0);
    expect(result.failure).toBeNull();
    expect(result.isTruncated).toBe(false);
  });
});
