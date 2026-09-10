// draft.ts — What somebody is writing, and the one field that decides its fate.
//
// `existingIssueKey` is the whole design. Blank means a new issue will be
// created; a key means that issue will be updated. There is no second way to
// reach either outcome, no mode flag, and no button that overrides it — so
// "enriched a stub and got a duplicate", which is the failure this feature most
// has to avoid, is structurally impossible rather than merely unlikely.
//
// `loadedFieldValues` exists for the other failure with no symptom. On save, a
// field is written only when its value genuinely differs from what the issue
// held when it was loaded. Comparing against anything else — a normalised form,
// a default — silently rewrites a description nobody touched.
//
// `operatorNarrative` is the operator's own words, kept with the draft to steer
// the assistant and to remind them what they meant. It has no field id, so there
// is nowhere for it to be written even by accident.

/** One piece of gathered reference material. */
export interface AuthoringSource {
  readonly sourceId: string;
  /** What the operator called it: "the brief", "Jana's message". */
  readonly label: string;
  readonly text: string;
  readonly addedAtIso: string;
}

/** What somebody is writing. */
export interface AuthoringDraft {
  /**
   * The issue being enriched, or null for a new one.
   *
   * This single field decides create versus update. Nothing else does.
   */
  readonly existingIssueKey: string | null;
  readonly summary: string;
  readonly description: string;
  readonly acceptanceCriteria: string;
  /** The operator's own words. Steers the prompt; never written to Jira. */
  readonly operatorNarrative: string;
  /** Chosen project. Ignored when enriching — the issue has its own. */
  readonly projectKey: string;
  /** Chosen issue type. Ignored when enriching. */
  readonly issueTypeId: string;
  /** Values for instance-specific fields, keyed by the instance's own field id. */
  readonly fieldValues: Readonly<Record<string, unknown>>;
  readonly sources: readonly AuthoringSource[];
  /**
   * What the enriched issue held when it was loaded.
   *
   * Written once, at load, and never afterwards. A save compares against this,
   * so a field the operator never touched produces no write.
   */
  readonly loadedFieldValues: Readonly<Record<string, unknown>> | null;
  readonly updatedAtIso: string;
}

/** A draft nobody has written yet. The normal first state, not an error. */
export function buildEmptyDraft(nowIso: string): AuthoringDraft {
  return {
    existingIssueKey: null,
    summary: "",
    description: "",
    acceptanceCriteria: "",
    operatorNarrative: "",
    projectKey: "",
    issueTypeId: "",
    fieldValues: {},
    sources: [],
    loadedFieldValues: null,
    updatedAtIso: nowIso,
  };
}

/**
 * Is this draft going to update an existing issue?
 *
 * The single question the whole feature turns on. Everything that behaves
 * differently between creating and enriching asks this and nothing else.
 */
export function isEnrichingExistingIssue(draft: AuthoringDraft): boolean {
  return draft.existingIssueKey !== null && draft.existingIssueKey.trim().length > 0;
}

/** Adds a source. It is reference material: it changes no field by itself. */
export function addSource(
  draft: AuthoringDraft,
  source: AuthoringSource,
): AuthoringDraft {
  return { ...draft, sources: [...draft.sources, source], updatedAtIso: source.addedAtIso };
}

/** Removes a source by its identifier. */
export function removeSource(
  draft: AuthoringDraft,
  sourceId: string,
  nowIso: string,
): AuthoringDraft {
  return {
    ...draft,
    sources: draft.sources.filter((source) => source.sourceId !== sourceId),
    updatedAtIso: nowIso,
  };
}

/**
 * Every value the draft would write, keyed by field id.
 *
 * The narrative is absent by construction rather than by being filtered out
 * here — it has no field id, so it cannot appear.
 */
/** Fields whose value is the create target's to decide, never a draft's. */
const IDENTITY_FIELD_IDS: readonly string[] = ["project", "issuetype", "issueType"];

export function readDraftFieldValues(
  draft: AuthoringDraft,
  summaryFieldId: string,
  descriptionFieldId: string,
  acceptanceCriteriaFieldId: string | null,
): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = { ...draft.fieldValues };

  // Which project and which type an issue is created in is decided by the create
  // target and by nothing else. Jira's create screen lists both among its
  // fields, so they arrive here as plain strings - and spread over the identity
  // the create target had chosen, which produced exactly this from Jira:
  //
  //   issuetype: Cannot construct instance of ResourceRef ... from String
  //              value ('Feature')
  //   project:   project is required
  //
  // The guard is narrow on purpose: dropping anything else would silently lose
  // somebody's work.
  for (const identityFieldId of IDENTITY_FIELD_IDS) delete values[identityFieldId];

  if (draft.summary.trim().length > 0) values[summaryFieldId] = draft.summary;
  if (draft.description.trim().length > 0) values[descriptionFieldId] = draft.description;
  if (acceptanceCriteriaFieldId !== null && draft.acceptanceCriteria.trim().length > 0) {
    values[acceptanceCriteriaFieldId] = draft.acceptanceCriteria;
  }

  return values;
}
