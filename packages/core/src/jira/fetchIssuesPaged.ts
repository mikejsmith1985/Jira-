// fetchIssuesPaged.ts — Paging that cannot be fooled by a short page.
//
// The rule this module exists for:
//
//   A page shorter than requested does NOT mean the results are exhausted.
//
// Jira Data Center clamps a page-size request above its configured maximum
// silently rather than rejecting it. Asking for 2,000 against a cap of 1,000
// returns 1,000, with no error and no warning. A pager that reads that as the
// end stops at 1,000 and then reports a confident, wrong total — which is the
// same shape of failure as a broken query rendering green, one layer down.
//
// So paging follows Jira's own reported total, and stops for exactly three
// reasons, each of which is reported distinctly: everything was fetched, the
// ceiling was reached, or something went wrong.

import type { RetrievalFailure } from "../model/issueSet.js";

/** One page as the caller's fetcher reports it. */
export interface FetchedPage {
  readonly issues: readonly Record<string, unknown>[];
  /** Jira's own count of everything matching, which is the paging authority. */
  readonly total: number;
  readonly failure: RetrievalFailure | null;
}

/** Everything a caller needs to describe the retrieval honestly. */
export interface PagedResult {
  readonly issues: readonly Record<string, unknown>[];
  readonly totalMatchingCount: number;
  readonly isTruncated: boolean;
  /** The page size the server actually honoured, which may be below what was asked. */
  readonly observedPageSize: number;
  readonly failure: RetrievalFailure | null;
}

/** Fetches one page. Injected so this module needs no network to be tested. */
export type PageFetcher = (startAt: number, pageSize: number) => Promise<FetchedPage>;

/** Bounds on one retrieval. Both are configurable and both are shown to the user. */
export interface PagingOptions {
  readonly pageSize: number;
  readonly ceiling: number;
}

/**
 * Retrieves every issue matching a query, up to the ceiling.
 *
 * @param fetchPage Fetches one page; the caller supplies the transport.
 * @param options Page size to request, and the most issues to retrieve.
 */
export async function fetchIssuesPaged(
  fetchPage: PageFetcher,
  options: PagingOptions,
): Promise<PagedResult> {
  const collected: Record<string, unknown>[] = [];
  let totalMatchingCount = 0;
  let observedPageSize = options.pageSize;
  let isFirstPage = true;

  while (collected.length < options.ceiling) {
    const remainingBeforeCeiling = options.ceiling - collected.length;
    const requestedPageSize = Math.min(options.pageSize, remainingBeforeCeiling);
    const page = await fetchPage(collected.length, requestedPageSize);

    if (page.failure !== null) {
      // Issues already retrieved are kept: a partial answer honestly labelled is
      // more use than nothing, provided it never claims to be whole.
      return {
        issues: collected,
        totalMatchingCount: page.total,
        isTruncated: true,
        observedPageSize,
        failure: page.failure,
      };
    }

    totalMatchingCount = page.total;

    if (isFirstPage) {
      // What the server honoured, not what was asked for. Above its own cap Jira
      // clamps in silence, so this is the only place the real page size shows.
      observedPageSize = page.issues.length > 0 ? page.issues.length : requestedPageSize;
      isFirstPage = false;
    }

    if (page.issues.length === 0) {
      // Nothing came back. That is only legitimate when nothing is outstanding —
      // otherwise the server is throttling or faulting, and treating it as the
      // end of the results would silently shorten the answer.
      if (collected.length < totalMatchingCount) {
        return {
          issues: collected,
          totalMatchingCount,
          isTruncated: true,
          observedPageSize,
          failure: {
            kind: "transport",
            message:
              `Jira returned no issues at position ${collected.length} while reporting ` +
              `${totalMatchingCount} matches. The retrieval is incomplete; this is not the end ` +
              `of the results.`,
          },
        };
      }
      break;
    }

    collected.push(...page.issues);

    // The authority is Jira's own total. A short page means the server clamped
    // the page size, not that the results ran out.
    if (collected.length >= totalMatchingCount) break;
  }

  return {
    issues: collected,
    totalMatchingCount,
    isTruncated: totalMatchingCount > collected.length,
    observedPageSize,
    failure: null,
  };
}
