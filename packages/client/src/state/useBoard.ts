// useBoard.ts — Reads a Jira board and everything it holds.
//
// Two requests, both to Jira's own Agile API: the board's columns, and the
// issues its own filter selects. Using the board's issue endpoint rather than a
// query of our own means the board shows exactly what people see in Jira, filter
// and all — which is the entire point of reading a board rather than
// reinventing one.

import { useCallback, useMemo, useState } from "react";

import {
  buildIssueSet,
  buildRetrievalRecord,
  computeFingerprint,
  createDataCenterAdapter,
  fetchBoardSpine,
  normaliseRawIssue,
} from "@jira-plus/core";
import type { BoardSpineResult, IssueSet, WorkspaceConfiguration } from "@jira-plus/core";

import { createBrowserJiraTransport } from "./jiraTransport.js";

/** Fields the board needs on every card. */
const BOARD_FIELD_IDS: readonly string[] = [
  "summary",
  "status",
  "issuetype",
  "project",
  "assignee",
  "created",
  "priority",
  "parent",
  "labels",
  "fixVersions",
];

/** What the board surface consumes. */
export interface BoardState {
  readonly spineResult: BoardSpineResult | null;
  readonly issueSet: IssueSet | null;
  readonly childIssues: readonly ReturnType<typeof normaliseRawIssue>[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly load: (boardId: number) => Promise<void>;
}

/** Reads a board and its issues. */
export function useBoard(configuration: WorkspaceConfiguration | null): BoardState {
  const [spineResult, setSpineResult] = useState<BoardSpineResult | null>(null);
  const [issueSet, setIssueSet] = useState<IssueSet | null>(null);
  const [childIssues, setChildIssues] = useState<readonly ReturnType<typeof normaliseRawIssue>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const adapter = useMemo(() => createDataCenterAdapter(createBrowserJiraTransport()), []);

  const load = useCallback(
    async (boardId: number) => {
      if (configuration === null) return;

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const spine = await fetchBoardSpine(boardId, adapter);
        setSpineResult(spine);

        // No columns means no board. There is deliberately no fallback: drawing
        // invented columns would produce something that looks like the user's
        // board and is not.
        if (spine.status !== "read") {
          setIssueSet(null);
          return;
        }

        const startedAt = Date.now();
        const response = await adapter.fetchBoardIssues(boardId, {
          fields: { kind: "explicit", fieldIds: BOARD_FIELD_IDS },
          startAt: 0,
          maxResults: configuration.retrievalCeiling,
        });

        if (response.statusCode !== 200 || response.body === null) {
          setErrorMessage(
            response.jiraMessages[0] ??
              `Jira would not return board ${boardId}'s issues (status ${response.statusCode}).`,
          );
          setIssueSet(null);
          return;
        }

        const page = response.body;
        const issues = page.issues.map((issue) => normaliseRawIssue(issue, page.names));

        const record = buildRetrievalRecord({
          jql: `board ${boardId} (${spine.spine.boardName}) — the board's own filter`,
          fieldsRequested: BOARD_FIELD_IDS,
          expandRequested: ["names"],
          startedAtIso: new Date(startedAt).toISOString(),
          durationMs: Date.now() - startedAt,
          totalMatchingCount: page.total,
          fetchedCount: issues.length,
          ceiling: configuration.retrievalCeiling,
          changelogCoverage: "none",
          workspaceFingerprint: computeFingerprint(configuration),
          failure: null,
        });

        setIssueSet(buildIssueSet(record, issues));

        // Sub-tasks are fetched separately: a board's issue list does not
        // include them, and a card marker driven by an open child needs them.
        const parentKeys = issues.map((issue) => issue.key);
        if (parentKeys.length > 0) {
          const childResponse = await adapter.searchIssuesByJql({
            jql: `parent in (${parentKeys.map((key) => `"${key}"`).join(", ")})`,
            fields: { kind: "explicit", fieldIds: ["summary", "status", "issuetype", "parent"] },
            doesIncludeChangelog: false,
            startAt: 0,
            maxResults: configuration.retrievalCeiling,
          });

          setChildIssues(
            childResponse.statusCode === 200 && childResponse.body !== null
              ? childResponse.body.issues.map((child) => normaliseRawIssue(child, {}))
              : [],
          );
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "The board could not be read.");
      } finally {
        setIsLoading(false);
      }
    },
    [adapter, configuration],
  );

  return { spineResult, issueSet, childIssues, isLoading, errorMessage, load };
}

export { BOARD_FIELD_IDS };
