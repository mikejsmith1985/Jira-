// deterministicFixes.ts — One-click fixes that need no assistant at all.
//
// These are the fastest route to somebody using the tool without authoring
// anything, which matters more than it sounds: the predecessor's AI features sat
// behind a keyboard shortcut and a passphrase, and friction on a tool with an
// adoption problem costs more than it protects.
//
// A deterministic fix produces exactly the same reviewable change set as an
// assistant proposal, and goes through exactly the same diff-then-apply path.
// There is no faster route that skips the review, because "it was obvious" is
// how a batch of unwanted writes gets made.

import type { CheckResult } from "../../checks/runChecks.js";
import type { DetailedIssue } from "../../model/detailedIssue.js";
import type { IssueSet } from "../../model/issueSet.js";
import type { Proposal } from "../buildChangeSet.js";

/** One fix a user can run with no prompt and no assistant. */
export interface DeterministicFix {
  readonly fixId: string;
  readonly title: string;
  /** Which check's findings this fix addresses. */
  readonly forCheckId: string;
  /** What it will do, in words, before it does it. */
  readonly describe: (issueCount: number) => string;
  buildProposals(input: {
    readonly issueSet: IssueSet;
    readonly flaggedIssues: readonly DetailedIssue[];
    readonly parameters: Readonly<Record<string, string>>;
  }): readonly Proposal[];
  /** What the user must supply first, if anything. */
  readonly requiredParameters: readonly { readonly name: string; readonly label: string }[];
}

/**
 * Sets a fix version on every flagged issue.
 *
 * The version is named by the user rather than inferred. Guessing "the current
 * unreleased one" is right often enough to be trusted and wrong often enough to
 * do damage quietly, which is the combination this product avoids.
 */
export const SET_MISSING_FIX_VERSION: DeterministicFix = {
  fixId: "set-missing-fix-version",
  title: "Set a fix version",
  forCheckId: "missing-fix-version",
  requiredParameters: [{ name: "versionName", label: "Which fix version?" }],

  describe: (issueCount) =>
    `Sets the fix version on ${issueCount} issue${issueCount === 1 ? "" : "s"} that have none. ` +
    `You will see every one as was → will be before anything is sent.`,

  buildProposals: ({ flaggedIssues, parameters }) => {
    const versionName = parameters.versionName ?? "";
    if (versionName.trim().length === 0) return [];

    return flaggedIssues.map(
      (issue): Proposal => ({
        issueKey: issue.key,
        target: { kind: "field", fieldId: "fixVersions" },
        proposedValue: [versionName.trim()],
        // Fix versions must go through update.set; the writer knows, the caller
        // does not have to.
        writeRoute: "fixVersion",
        rationale: `Had no fix version; setting ${versionName.trim()}.`,
        source: "deterministic-fix",
      }),
    );
  },
};

/** Every deterministic fix this build ships. */
export const ALL_DETERMINISTIC_FIXES: readonly DeterministicFix[] = [SET_MISSING_FIX_VERSION];

/** Finds a fix by identifier, or undefined when nothing declares it. */
export function findDeterministicFix(fixId: string): DeterministicFix | undefined {
  return ALL_DETERMINISTIC_FIXES.find((fix) => fix.fixId === fixId);
}

/** Finds the fix that addresses a check's findings, when one exists. */
export function findFixForCheck(result: CheckResult): DeterministicFix | undefined {
  return ALL_DETERMINISTIC_FIXES.find((fix) => fix.forCheckId === result.check.checkId);
}
