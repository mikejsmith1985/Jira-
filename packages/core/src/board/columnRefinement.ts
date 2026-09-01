// columnRefinement.ts — The resolution Jira columns cannot express.
//
// The team's workflow needs more detail than a Jira board column can hold. A
// sub-status field separates internal test from external QE test and external BT
// test — one status, three different states. An open sub-task means a dev item
// is in code review, which is not a status at all.
//
// The predecessor solved this by REPLACING Jira's columns with its own
// vocabulary. This solves it by adding a declared delta ON TOP of them, and the
// difference is everything:
//
//   - A band is drawn inside the column it refines, so the column's own total
//     still reconciles with Jira exactly.
//   - A card marker is a badge, never a column, because inventing a column Jira
//     does not have is precisely what breaks that reconciliation.
//   - Anything the bands cannot classify stays visible in the same column.
//   - A refinement can change how a column LOOKS. It can never lose a card.

import type { ConceptId } from "../fields/conceptId.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { FieldMap } from "../workspace/workspaceConfig.js";
import type { BoardSpine } from "./boardSpine.js";

/** The band that catches whatever the declared bands do not. */
export const UNCLASSIFIED_BAND_ID = "__unclassified";

/** One declared division within a column. */
export interface RefinementBand {
  readonly bandId: string;
  readonly label: string;
  /** The field values this band claims. Compared case-insensitively, exactly. */
  readonly equalsAnyOf: readonly string[];
  /** True when this band claims cards whose field is empty. */
  readonly doesMatchEmpty?: boolean;
}

/** A rule that puts a badge on a card, driven by an open child issue. */
export interface CardMarker {
  readonly markerId: string;
  readonly label: string;
  /** Child issue types that can raise this marker. Empty means any type. */
  readonly childIssueTypeNames: readonly string[];
  /** A pattern the child's summary must contain. Empty means any summary. */
  readonly childSummaryContains: string;
}

/** How one Jira column is refined. */
export interface ColumnRefinement {
  readonly refinementId: string;
  /** Must match a live spine column's name. This is the tie to Jira. */
  readonly refinesColumnName: string;
  /** The concept whose values divide the column. */
  readonly splitByConcept: ConceptId;
  readonly bands: readonly RefinementBand[];
  readonly unclassifiedLabel: string;
}

/** What a validation pass found. */
export interface RefinementValidation {
  readonly isValid: boolean;
  /** Refinements naming a column the board no longer has. */
  readonly staleRefinements: readonly {
    readonly refinementId: string;
    readonly refinesColumnName: string;
    readonly liveColumnNames: readonly string[];
  }[];
  /** Refinements whose concept has no confirmed Jira field. */
  readonly unresolvedFields: readonly {
    readonly refinementId: string;
    readonly conceptId: ConceptId;
  }[];
}

/**
 * Checks refinements against the live board and the confirmed field map.
 *
 * A stale refinement is REPORTED, loudly, and its column renders unrefined with
 * every one of its cards. It is never silently dropped: a column that quietly
 * stopped splitting looks exactly like a column that never split, and the user
 * would go on believing a distinction that is no longer being drawn.
 */
export function validateRefinements(
  spine: BoardSpine,
  refinements: readonly ColumnRefinement[],
  fieldMap: FieldMap,
): RefinementValidation {
  const liveColumnNames = spine.columns.map((column) => column.columnName);

  const staleRefinements = refinements
    .filter((refinement) => !liveColumnNames.includes(refinement.refinesColumnName))
    .map((refinement) => ({
      refinementId: refinement.refinementId,
      refinesColumnName: refinement.refinesColumnName,
      liveColumnNames,
    }));

  const unresolvedFields = refinements
    .filter((refinement) => fieldMap[refinement.splitByConcept].state !== "resolved")
    .map((refinement) => ({
      refinementId: refinement.refinementId,
      conceptId: refinement.splitByConcept,
    }));

  return {
    isValid: staleRefinements.length === 0 && unresolvedFields.length === 0,
    staleRefinements,
    unresolvedFields,
  };
}

/** One band, with the cards that fell into it. */
export interface BandedGroup {
  readonly bandId: string;
  readonly label: string;
  readonly issues: readonly DetailedIssue[];
  readonly isUnclassified: boolean;
}

/** A column after refinement, or unrefined with a reason. */
export interface BandedColumn {
  readonly columnId: string;
  readonly columnName: string;
  readonly issues: readonly DetailedIssue[];
  readonly bands: readonly BandedGroup[];
  /** Null when the column is refined; a sentence when it is not and should have been. */
  readonly unrefinedReason: string | null;
  /** Set when refined, so the interface can say what it is splitting by. */
  readonly splitDescription: string | null;
}

/** Reads the value a refinement splits by, as comparable text. */
function readBandValue(
  issue: DetailedIssue,
  refinement: ColumnRefinement,
  fieldMap: FieldMap,
): string | null {
  const entry = fieldMap[refinement.splitByConcept];
  if (entry.state !== "resolved") return null;

  const rawValue = issue.fields.get(entry.fieldId);
  if (rawValue === null || rawValue === undefined) return null;

  if (typeof rawValue === "object") {
    const record = rawValue as Record<string, unknown>;
    const readable = record.value ?? record.name;
    return readable === undefined ? null : String(readable);
  }

  const text = String(rawValue).trim();
  return text.length === 0 ? null : text;
}

/** Which band claims a card, or null when none does. */
function findBandFor(
  issue: DetailedIssue,
  refinement: ColumnRefinement,
  fieldMap: FieldMap,
): RefinementBand | null {
  const value = readBandValue(issue, refinement, fieldMap);

  if (value === null) {
    return refinement.bands.find((band) => band.doesMatchEmpty === true) ?? null;
  }

  const normalised = value.toLowerCase();
  return (
    refinement.bands.find((band) =>
      band.equalsAnyOf.some((candidate) => candidate.trim().toLowerCase() === normalised),
    ) ?? null
  );
}

/**
 * Divides one column's cards into its bands.
 *
 * The invariant: the bands hold exactly the cards the column held, no more and
 * no fewer. Every card appears in exactly one band, and one of those bands is
 * the explicit unclassified catch-all — so a value nobody anticipated is visible
 * rather than absent.
 */
export function assignCardsToBands(input: {
  readonly columnId: string;
  readonly columnName: string;
  readonly issues: readonly DetailedIssue[];
  readonly refinement: ColumnRefinement | undefined;
  readonly fieldMap: FieldMap;
  readonly unrefinedReason?: string;
}): BandedColumn {
  const base = {
    columnId: input.columnId,
    columnName: input.columnName,
    issues: input.issues,
  };

  if (input.refinement === undefined) {
    return {
      ...base,
      bands: [],
      unrefinedReason: input.unrefinedReason ?? null,
      splitDescription: null,
    };
  }

  const refinement = input.refinement;
  const entry = input.fieldMap[refinement.splitByConcept];

  if (entry.state !== "resolved") {
    return {
      ...base,
      bands: [],
      unrefinedReason:
        `This column is not split, because no Jira field is confirmed for ` +
        `${refinement.splitByConcept}. Every card is still here.`,
      splitDescription: null,
    };
  }

  const byBandId = new Map<string, DetailedIssue[]>();
  const unclassified: DetailedIssue[] = [];

  for (const issue of input.issues) {
    const band = findBandFor(issue, refinement, input.fieldMap);
    if (band === null) {
      unclassified.push(issue);
      continue;
    }
    const group = byBandId.get(band.bandId) ?? [];
    group.push(issue);
    byBandId.set(band.bandId, group);
  }

  const bands: BandedGroup[] = refinement.bands.map((band) => ({
    bandId: band.bandId,
    label: band.label,
    issues: byBandId.get(band.bandId) ?? [],
    isUnclassified: false,
  }));

  // Always present when it holds anything. A card nobody anticipated must be
  // visible in the column it belongs to, not quietly absent from the board.
  if (unclassified.length > 0) {
    bands.unshift({
      bandId: UNCLASSIFIED_BAND_ID,
      label: refinement.unclassifiedLabel,
      issues: unclassified,
      isUnclassified: true,
    });
  }

  return {
    ...base,
    bands,
    unrefinedReason: null,
    splitDescription: `Jira's "${input.columnName}" column, split by ${entry.jiraName}`,
  };
}

/**
 * Confirms a banded column lost nothing.
 *
 * Called in development. The check is trivial and the defect it catches — a card
 * that exists in the column but appears in no band — would be invisible on
 * screen, which makes it exactly the kind worth asserting.
 */
export function assertBandsHoldEveryCard(column: BandedColumn): void {
  if (column.bands.length === 0) return;

  const banded = column.bands.reduce((total, band) => total + band.issues.length, 0);
  if (banded !== column.issues.length) {
    throw new Error(
      `Column "${column.columnName}" holds ${column.issues.length} cards but its bands hold ` +
        `${banded}. A refinement may change how a column looks; it may never lose a card.`,
    );
  }
}

/** Does this card carry the marker? */
export function hasCardMarker(
  issue: DetailedIssue,
  childIssues: readonly DetailedIssue[],
  marker: CardMarker,
): boolean {
  return childIssues.some((child) => {
    const isChildOfThisIssue = readParentKey(child) === issue.key;
    if (!isChildOfThisIssue) return false;

    // Only an OPEN child raises a marker. A finished code-review sub-task means
    // the review happened, which is the opposite of what the badge says.
    if (child.statusCategoryKey === "done") return false;

    const doesTypeMatch =
      marker.childIssueTypeNames.length === 0 ||
      marker.childIssueTypeNames.some(
        (typeName) => typeName.trim().toLowerCase() === child.issueTypeName.trim().toLowerCase(),
      );
    if (!doesTypeMatch) return false;

    if (marker.childSummaryContains.trim().length === 0) return true;
    const summary = String(child.fields.get("summary") ?? "").toLowerCase();
    return summary.includes(marker.childSummaryContains.trim().toLowerCase());
  });
}

/** Reads an issue's parent key from Jira's native parent field. */
function readParentKey(issue: DetailedIssue): string | null {
  const parent = issue.fields.get("parent");
  if (parent === null || parent === undefined || typeof parent !== "object") return null;
  const key = (parent as Record<string, unknown>).key;
  return typeof key === "string" ? key : null;
}
