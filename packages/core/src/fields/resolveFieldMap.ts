// resolveFieldMap.ts — Which Jira field is which, confirmed rather than guessed.
//
// The predecessor bound its story-points check to a hardcoded field id that was
// wrong for this instance. Forty-one pointed issues were reported unpointed, and
// accepted "fixes" wrote into a field nothing reads. Nothing on any screen said
// which field had been picked, so the mistake survived for months.
//
// Three rules follow from that, and none of them is negotiable:
//
//   1. NO default field id ships anywhere. The tool can be unconfigured; it
//      cannot be confidently wrong.
//   2. Matching is EXACT, never substring. "Story Points Estimate" is a
//      different field from "Story Points", and on this instance only one of
//      them holds the value.
//   3. A match is PROPOSED, never committed. Confirmation is a human act, made
//      against a real value from an issue the user names.

import { ALL_CONCEPT_IDS, CONCEPT_DESCRIPTIONS } from "./conceptId.js";
import type { ConceptId } from "./conceptId.js";
import type { JiraAdapter, JiraFieldDescriptor } from "../jira/jiraAdapter.js";
import type { DetailedIssue } from "../model/detailedIssue.js";
import type { FieldMap, FieldMapEntry } from "../workspace/workspaceConfig.js";

/** One field offered for a concept, with everything needed to judge it. */
export interface FieldCandidate {
  readonly fieldId: string;
  readonly jiraName: string;
  readonly schemaType: string;
  readonly clauseNames: readonly string[];
  /** A real value from an issue the user named. The only confirmation that works. */
  readonly sampleValue: string | null;
}

/** What setup offers for one concept. */
export interface ConceptProposal {
  readonly conceptId: ConceptId;
  readonly label: string;
  readonly currentEntry: FieldMapEntry;
  readonly candidates: readonly FieldCandidate[];
}

/** The whole proposal, or the reason there is none. */
export type FieldMapResolution =
  | { readonly status: "resolved"; readonly proposals: readonly ConceptProposal[] }
  | { readonly status: "catalogue-unavailable"; readonly reason: string };

/** Compares two field names exactly, ignoring case and surrounding space only. */
function isExactNameMatch(jiraName: string, expectedName: string): boolean {
  return jiraName.trim().toLowerCase() === expectedName.trim().toLowerCase();
}

/** Renders a field's value from an issue as something a person can recognise. */
function readSampleValue(issue: DetailedIssue | null, fieldId: string): string | null {
  if (issue === null) return null;
  const rawValue = issue.fields.get(fieldId);
  if (rawValue === null || rawValue === undefined) return null;

  if (typeof rawValue === "object") {
    const record = rawValue as Record<string, unknown>;
    const readable = record.value ?? record.name ?? record.displayName ?? record.key;
    if (readable !== undefined) return String(readable);
    if (Array.isArray(rawValue)) {
      return rawValue.length === 0 ? null : `${rawValue.length} values`;
    }
    return JSON.stringify(rawValue).slice(0, 120);
  }

  const asText = String(rawValue).trim();
  return asText.length === 0 ? null : asText;
}

/**
 * Builds the setup proposal for every concept.
 *
 * `sampleIssue` is an issue the user named. Showing its real value beside each
 * candidate is what turns confirmation from nominal into real: a field id and a
 * name can both look right while pointing at the wrong thing, but a value
 * somebody recognises cannot.
 */
export async function resolveFieldMap(
  adapter: JiraAdapter,
  storedMap: FieldMap,
  sampleIssue: DetailedIssue | null,
): Promise<FieldMapResolution> {
  const catalogue = await adapter.fetchFieldCatalogue();

  // A failed catalogue read makes every concept-dependent check unmeasurable.
  // It must NEVER fall back to defaults, because a scan on defaults looks
  // exactly like a scan that worked.
  if (catalogue.statusCode !== 200 || catalogue.body === null) {
    return {
      status: "catalogue-unavailable",
      reason:
        catalogue.jiraMessages[0] ??
        `Jira's field list could not be read (status ${catalogue.statusCode}). ` +
          `No concept can be mapped, so every check that needs one will report as not measurable.`,
    };
  }

  const fields: readonly JiraFieldDescriptor[] = catalogue.body;

  const proposals = ALL_CONCEPT_IDS.map((conceptId): ConceptProposal => {
    const expectedNames = CONCEPT_DESCRIPTIONS[conceptId].expectedJiraNames;

    const candidates = fields
      .filter((field) => expectedNames.some((expected) => isExactNameMatch(field.jiraName, expected)))
      .map(
        (field): FieldCandidate => ({
          fieldId: field.fieldId,
          jiraName: field.jiraName,
          schemaType: field.schemaType,
          clauseNames: field.clauseNames,
          sampleValue: readSampleValue(sampleIssue, field.fieldId),
        }),
      );

    return {
      conceptId,
      label: CONCEPT_DESCRIPTIONS[conceptId].label,
      // Whatever the user previously confirmed stays confirmed. Discovery only
      // proposes; it never overwrites a decision somebody made.
      currentEntry: storedMap[conceptId],
      candidates,
    };
  });

  return { status: "resolved", proposals };
}

/** Records a user's choice for one concept. */
export function confirmFieldChoice(
  fieldMap: FieldMap,
  conceptId: ConceptId,
  candidate: FieldCandidate,
  confirmedAtIso: string,
): FieldMap {
  return {
    ...fieldMap,
    [conceptId]: {
      state: "resolved",
      fieldId: candidate.fieldId,
      jiraName: candidate.jiraName,
      matchedBy: "exact-name",
      confirmedAtIso,
    },
  };
}

/**
 * Records that a concept has no field on this instance.
 *
 * A confirmed absence is different from an unanswered question: it yields a
 * grey, inapplicable result rather than an amber, blocking one. Neither can
 * render as a pass.
 */
export function confirmConceptAbsent(
  fieldMap: FieldMap,
  conceptId: ConceptId,
  confirmedAtIso: string,
): FieldMap {
  return { ...fieldMap, [conceptId]: { state: "absent", confirmedAtIso } };
}

/** Clears a concept back to unmapped. */
export function clearFieldChoice(fieldMap: FieldMap, conceptId: ConceptId): FieldMap {
  return { ...fieldMap, [conceptId]: { state: "unmapped" } };
}

/**
 * Reads one concept's value from an issue.
 *
 * The ONLY path from a rule to a Jira field. There is no way for a check to name
 * a `customfield_` id, which is what stopped the predecessor's duplicate default
 * tables from being possible here.
 */
export function readConceptValue(
  issue: DetailedIssue,
  conceptId: ConceptId,
  fieldMap: FieldMap,
): unknown {
  const entry = fieldMap[conceptId];
  if (entry.state !== "resolved") return undefined;
  return issue.fields.get(entry.fieldId);
}

/** Which concepts are still unanswered, blocking the checks that need them. */
export function listUnresolvedConcepts(
  fieldMap: FieldMap,
  requiredConcepts: readonly ConceptId[],
): readonly ConceptId[] {
  return requiredConcepts.filter((conceptId) => {
    const state = fieldMap[conceptId].state;
    return state === "unmapped" || state === "ambiguous";
  });
}

/** Which of these concepts the instance genuinely does not have. */
export function listAbsentConcepts(
  fieldMap: FieldMap,
  requiredConcepts: readonly ConceptId[],
): readonly ConceptId[] {
  return requiredConcepts.filter((conceptId) => fieldMap[conceptId].state === "absent");
}
