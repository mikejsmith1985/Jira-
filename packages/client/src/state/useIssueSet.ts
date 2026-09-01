// useIssueSet.ts — Holds the one retrieval every surface reads from.
//
// Retrieval is deliberate: it happens when somebody asks for it and never
// behind their back. That is why nothing here refetches on focus or on an
// interval — a chart that silently changed while a person was explaining it
// would undo the whole argument the product is trying to make.

import { useCallback, useMemo, useState } from "react";

import { createDataCenterAdapter, fetchIssueSet } from "@jira-plus/core";
import type { FieldSelection, IssueSet, WorkspaceConfiguration } from "@jira-plus/core";

import { createBrowserJiraTransport } from "./jiraTransport.js";

/** Fields every surface needs, whatever else a particular query asks for. */
const BASE_FIELD_IDS: readonly string[] = [
  "summary",
  "status",
  "issuetype",
  "project",
  "assignee",
  "created",
  "resolutiondate",
  "priority",
  "labels",
  "fixVersions",
  "parent",
  "issuelinks",
  "subtasks",
  "description",
];

/** How far a retrieval has got, so a long one can show progress honestly. */
export interface RetrievalProgress {
  readonly fetchedCount: number;
  readonly totalMatchingCount: number;
}

/** What every surface consumes. */
export interface IssueSetState {
  readonly issueSet: IssueSet | null;
  readonly isRetrieving: boolean;
  readonly progress: RetrievalProgress | null;
  readonly lastJql: string;
  readonly run: (jql: string, options?: { doesRequireChangelog?: boolean; doesRequestAllFields?: boolean }) => Promise<void>;
  readonly clear: () => void;
}

/**
 * Runs one JQL query and holds the frozen result.
 *
 * `doesRequireChangelog` is off by default. Data Center returns history
 * uncapped, which is better than Cloud's truncation but heavy enough that
 * Atlassian warns about memory — so a query that does not need history does not
 * pay for it.
 */
export function useIssueSet(configuration: WorkspaceConfiguration | null): IssueSetState {
  const [issueSet, setIssueSet] = useState<IssueSet | null>(null);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [progress, setProgress] = useState<RetrievalProgress | null>(null);
  const [lastJql, setLastJql] = useState("");

  const adapter = useMemo(() => createDataCenterAdapter(createBrowserJiraTransport()), []);

  const run = useCallback(
    async (
      jql: string,
      options: { doesRequireChangelog?: boolean; doesRequestAllFields?: boolean } = {},
    ) => {
      if (configuration === null) return;

      setIsRetrieving(true);
      setProgress(null);
      setLastJql(jql);

      const fieldSelection: FieldSelection =
        options.doesRequestAllFields === true
          ? { kind: "all" }
          : { kind: "explicit", fieldIds: BASE_FIELD_IDS };

      try {
        const retrieved = await fetchIssueSet(
          {
            jql,
            fieldSelection,
            doesRequireChangelog: options.doesRequireChangelog === true,
            configuration,
            onProgress: (fetchedCount, totalMatchingCount) =>
              setProgress({ fetchedCount, totalMatchingCount }),
          },
          adapter,
        );
        setIssueSet(retrieved);
      } finally {
        setIsRetrieving(false);
      }
    },
    [adapter, configuration],
  );

  const clear = useCallback(() => {
    setIssueSet(null);
    setProgress(null);
    setLastJql("");
  }, []);

  return { issueSet, isRetrieving, progress, lastJql, run, clear };
}

export { BASE_FIELD_IDS };
