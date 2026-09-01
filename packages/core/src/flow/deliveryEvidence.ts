// deliveryEvidence.ts — The document you hand to somebody who doubts you.
//
// The persuasive artifact is not a chart. It is an AUDITABLE chart: the figures,
// then every issue key behind them, then the exact query, then the query that
// reproduces the headline number in Jira without this tool.
//
// The claim stops being "trust our velocity" and becomes "47 items in 8 weeks,
// median 6 days, 85th percentile 14 — here is every key, here is the query,
// check it yourself." Trust follows from being checkable, and from the fact that
// when a figure cannot be computed the document says so instead of rounding it
// to something comfortable.

import type { IssueSet } from "../model/issueSet.js";
import type { WorkspaceConfiguration } from "../workspace/workspaceConfig.js";
import { buildVerifyingJql, describeLens } from "./completionLens.js";
import type { ResolvedLens } from "./completionLens.js";
import type { CycleTimeResult, FlowFactSet, ThroughputResult } from "./flowMeasures.js";
import { toIsoDate } from "./workingDays.js";

/** One line of the evidence document's issue list. */
export interface EvidenceIssueLine {
  readonly issueKey: string;
  readonly summary: string;
  readonly issueTypeName: string;
  readonly completedIsoDate: string;
  readonly cycleTimeDays: number | null;
}

/** The whole document, ready to render or export. */
export interface DeliveryEvidenceDocument {
  readonly title: string;
  readonly lensDescription: string;
  readonly periodStartIsoDate: string;
  readonly periodEndIsoDate: string;

  readonly completedCount: number;
  readonly weeklyMean: number;
  readonly medianCycleTimeDays: number;
  readonly eightyFifthPercentileDays: number;
  readonly workMix: readonly { readonly issueTypeName: string; readonly count: number }[];

  /** Every contributing issue. Not a sample — the point is that it can be checked. */
  readonly issueLines: readonly EvidenceIssueLine[];

  /** The query that produced the retrieval, verbatim. */
  readonly scopeJql: string;
  /** The query somebody can run in Jira to reproduce the headline count. */
  readonly verifyingJql: string;

  readonly fetchedCount: number;
  readonly totalMatchingCount: number;
  readonly isTruncated: boolean;
  readonly excludedKeys: readonly string[];
  readonly workspaceFingerprint: string;
  readonly generatedAtIso: string;
}

/** Reads the earliest and latest completion in a fact set. */
function readPeriodBounds(factSet: FlowFactSet): { startMs: number; endMs: number } {
  const completions = factSet.facts
    .map((fact) => fact.completedMs)
    .filter((value): value is number => value !== null);

  if (completions.length === 0) {
    const now = Date.now();
    return { startMs: now, endMs: now };
  }

  return { startMs: Math.min(...completions), endMs: Math.max(...completions) };
}

/**
 * Builds the evidence document.
 *
 * Everything it asserts is accompanied by what would be needed to disprove it:
 * the keys, the query, the counts, and the configuration identifier. A reader
 * who distrusts the author has everything required to check without them.
 */
export function buildDeliveryEvidence(input: {
  readonly issueSet: IssueSet;
  readonly factSet: FlowFactSet;
  readonly lens: ResolvedLens;
  readonly throughput: ThroughputResult;
  readonly cycleTime: CycleTimeResult;
  readonly configuration: WorkspaceConfiguration;
  readonly generatedAtIso: string;
}): DeliveryEvidenceDocument {
  const bounds = readPeriodBounds(input.factSet);
  const periodStartIsoDate = toIsoDate(bounds.startMs);
  const periodEndIsoDate = toIsoDate(bounds.endMs);

  const cycleTimeByKey = new Map(
    input.cycleTime.points.map((point) => [point.issueKey, point.cycleTimeDays]),
  );

  const issueLines: EvidenceIssueLine[] = input.factSet.facts
    .filter((fact) => fact.completedMs !== null)
    .sort((first, second) => (first.completedMs ?? 0) - (second.completedMs ?? 0))
    .map((fact) => ({
      issueKey: fact.issue.key,
      summary: String(fact.issue.fields.get("summary") ?? ""),
      issueTypeName: fact.issue.issueTypeName,
      completedIsoDate: toIsoDate(fact.completedMs ?? 0),
      cycleTimeDays: cycleTimeByKey.get(fact.issue.key) ?? null,
    }));

  const weeklyMean =
    input.throughput.weeks.length === 0
      ? 0
      : issueLines.length / input.throughput.weeks.length;

  const workMix = [...input.throughput.workMix.entries()]
    .map(([issueTypeName, keys]) => ({ issueTypeName, count: keys.length }))
    .sort((first, second) => second.count - first.count);

  return {
    title: `Delivery evidence — ${input.lens.lens.label}`,
    lensDescription: describeLens(input.lens),
    periodStartIsoDate,
    periodEndIsoDate,

    completedCount: issueLines.length,
    weeklyMean,
    medianCycleTimeDays: input.cycleTime.percentiles.get(50) ?? 0,
    eightyFifthPercentileDays: input.cycleTime.percentiles.get(85) ?? 0,
    workMix,

    issueLines,

    scopeJql: input.issueSet.record.jql,
    verifyingJql: buildVerifyingJql({
      lens: input.lens.lens,
      scopeJql: input.issueSet.record.jql,
      completionStatuses: input.lens.completionStatuses,
      periodStartIsoDate,
      periodEndIsoDate,
    }),

    fetchedCount: input.issueSet.record.fetchedCount,
    totalMatchingCount: input.issueSet.record.totalMatchingCount,
    isTruncated: input.issueSet.record.isTruncated,
    excludedKeys: input.factSet.excludedKeys,
    workspaceFingerprint: input.issueSet.record.workspaceFingerprint,
    generatedAtIso: input.generatedAtIso,
  };
}

/**
 * Renders the document as Markdown.
 *
 * Markdown because it pastes into a status update, a wiki page or an email
 * without losing the issue list — and the issue list is the part that makes the
 * rest believable.
 */
export function renderDeliveryEvidenceMarkdown(document: DeliveryEvidenceDocument): string {
  const lines: string[] = [
    `# ${document.title}`,
    "",
    `**${document.periodStartIsoDate} to ${document.periodEndIsoDate}**`,
    "",
    document.lensDescription,
    "",
    "## The figures",
    "",
    `- **${document.completedCount}** items completed`,
    `- **${document.weeklyMean.toFixed(1)}** per week on average`,
    `- Median **${document.medianCycleTimeDays.toFixed(1)}** working days from start to finish`,
    `- 85% finished within **${document.eightyFifthPercentileDays.toFixed(1)}** working days`,
    "",
    "### Work mix",
    "",
    ...document.workMix.map((entry) => `- ${entry.issueTypeName}: ${entry.count}`),
    "",
    "## How to check this without the tool",
    "",
    "Run this in Jira for the same period. It should return the same items:",
    "",
    "```",
    document.verifyingJql,
    "```",
    "",
    "The query the figures were drawn from:",
    "",
    "```",
    document.scopeJql,
    "```",
    "",
    "## What was retrieved",
    "",
    `- ${document.fetchedCount} of ${document.totalMatchingCount} matching issues` +
      (document.isTruncated ? " — **incomplete**, so every figure above is a floor" : " — complete"),
    `- Configuration: \`${document.workspaceFingerprint}\``,
    `- Generated: ${document.generatedAtIso}`,
  ];

  if (document.excludedKeys.length > 0) {
    lines.push(
      "",
      `- **${document.excludedKeys.length} issues excluded** because their change history was not ` +
        `available: ${document.excludedKeys.join(", ")}. They are not counted as unfinished; they ` +
        `are not counted at all.`,
    );
  }

  lines.push(
    "",
    "## Every item counted",
    "",
    "| Key | Type | Summary | Completed | Working days |",
    "| --- | --- | --- | --- | --- |",
    ...document.issueLines.map(
      (line) =>
        `| ${line.issueKey} | ${line.issueTypeName} | ${line.summary} | ${line.completedIsoDate} | ` +
        `${line.cycleTimeDays === null ? "—" : line.cycleTimeDays.toFixed(1)} |`,
    ),
  );

  return lines.join("\n");
}
