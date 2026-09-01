// familyProgress.ts — Two figures, side by side, never blended.
//
// Dev-only progress is the number the team already trusts, and its definition
// does not change because this feature exists. Whole-family progress — dev plus
// QE plus BT — sits beside it.
//
// They are never merged. A single blended percentage would be a number nobody
// can decompose: a lane at 60% would leave a reader unable to say whether dev is
// finished and QE has not started, or the reverse, and those are opposite
// situations calling for opposite conversations.
//
// A clone that could not be read makes the family figure PARTIAL and says so. It
// is not quietly excluded, because a family figure that silently covers less
// than the family is the same lie as a count that silently covers fewer issues.

import { measure } from "../measure/measure.js";
import type { Measure } from "../measure/measure.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { IssueSet } from "../model/issueSet.js";

/** How a discipline's own board describes its work, when one could be read. */
export type DisciplineView =
  | { readonly mode: "own-columns"; readonly columnNames: readonly string[]; readonly boardName: string }
  /** Jira's own universal vocabulary, used when a board could not be read. */
  | { readonly mode: "coarse-three-state"; readonly reason: string };

/** One discipline's work beneath one dev Feature. */
export interface DisciplineRow {
  readonly disciplineId: string;
  readonly label: string;
  readonly cloneKeys: readonly string[];
  readonly issues: readonly DetailedIssue[];
  readonly view: DisciplineView;
  /** Always read-only. Their columns are not ours to write to. */
  readonly isReadOnly: true;
  readonly progress: Measure;
}

/** The two figures for one Feature. */
export interface FamilyProgress {
  /** Unchanged in definition by this feature. The number already trusted. */
  readonly devOnly: Measure;
  /** Dev plus every discipline. Partial when a clone could not be read. */
  readonly wholeFamily: Measure;
  readonly unreadableCloneKeys: readonly string[];
}

/** Issues Jira considers finished. */
function findCompletedKeys(issues: readonly DetailedIssue[]): readonly string[] {
  return issues.filter((issue) => issue.statusCategoryKey === "done").map((issue) => issue.key);
}

/** Coarse state, from Jira's own categories, when a discipline's board is unreadable. */
export function toCoarseState(issue: DetailedIssue): "not started" | "in progress" | "done" {
  if (issue.statusCategoryKey === "new") return "not started";
  if (issue.statusCategoryKey === "done") return "done";
  return "in progress";
}

/**
 * Builds one discipline's row.
 *
 * Where the discipline's own board could be read, its work is described in ITS
 * columns. Where it could not, the row falls back to Jira's universal three
 * states and SAYS SO — forcing QE's work into the dev team's column vocabulary
 * would be the same class of lie as the parallel vocabulary this whole design
 * removed.
 */
export function buildDisciplineRow(input: {
  readonly disciplineId: string;
  readonly label: string;
  readonly cloneKeys: readonly string[];
  readonly issues: readonly DetailedIssue[];
  readonly view: DisciplineView;
  readonly issueSet: IssueSet;
}): DisciplineRow {
  return {
    disciplineId: input.disciplineId,
    label: input.label,
    cloneKeys: input.cloneKeys,
    issues: input.issues,
    view: input.view,
    isReadOnly: true,
    progress: measure({
      sourceId: `discipline-${input.disciplineId}`,
      flaggedKeys: findCompletedKeys(input.issues),
      eligibleKeys: input.issues.map((issue) => issue.key),
      issueSet: input.issueSet,
    }),
  };
}

/**
 * The two figures for one Feature lane.
 *
 * Deliberately returns two Measures rather than one blended figure. Each opens
 * to its own issues, so a reader can always establish which half of a family is
 * holding it up.
 */
export function buildFamilyProgress(input: {
  readonly devIssues: readonly DetailedIssue[];
  readonly disciplineRows: readonly DisciplineRow[];
  readonly unreadableCloneKeys: readonly string[];
  readonly issueSet: IssueSet;
  readonly featureKey: string;
}): FamilyProgress {
  const familyIssues = [
    ...input.devIssues,
    ...input.disciplineRows.flatMap((row) => row.issues),
  ];

  const devOnly = measure({
    sourceId: `family-dev-${input.featureKey}`,
    flaggedKeys: findCompletedKeys(input.devIssues),
    eligibleKeys: input.devIssues.map((issue) => issue.key),
    issueSet: input.issueSet,
  });

  const wholeFamily = measure({
    sourceId: `family-whole-${input.featureKey}`,
    flaggedKeys: findCompletedKeys(familyIssues),
    eligibleKeys: familyIssues.map((issue) => issue.key),
    issueSet: input.issueSet,
  });

  return { devOnly, wholeFamily, unreadableCloneKeys: input.unreadableCloneKeys };
}

/**
 * How the pair reads on screen.
 *
 * "Dev 8/8 · Family 14/21 (at least)" says more in nine characters than a single
 * blended percentage says at any length — and the second half never masquerades
 * as the first.
 */
export function describeFamilyProgress(progress: FamilyProgress): string {
  const describe = (subject: Measure): string =>
    subject.state === "measured"
      ? `${subject.flaggedKeys.length}/${subject.eligibleKeys.length}`
      : "—";

  const familyText = describe(progress.wholeFamily);
  const suffix =
    progress.unreadableCloneKeys.length > 0
      ? ` (at least — ${progress.unreadableCloneKeys.length} clone` +
        `${progress.unreadableCloneKeys.length === 1 ? "" : "s"} could not be read)`
      : "";

  return `Dev ${describe(progress.devOnly)} · Family ${familyText}${suffix}`;
}
