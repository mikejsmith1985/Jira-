// workspaceConfig.ts — The one record that can change a number, and the eight
// characters that identify it.
//
// The predecessor kept its rule configuration in a single browser storage key.
// Two people opening the same project ran different checks with different
// severities, and neither was ever told. Here the configuration lives outside
// the browser, in one document per installation.
//
// Each person still runs their own copy, so there is no shared store to make
// them agree. The fingerprint does not prevent that — it makes it VISIBLE, so a
// disagreement about numbers resolves to a disagreement about configuration
// before anyone defends a figure. That is the achievable win without asking
// somebody to provision a server.

import type { ConceptId } from "../fields/conceptId.js";
import { ALL_CONCEPT_IDS } from "../fields/conceptId.js";
import {
  DEFAULT_RETRIEVAL_CEILING,
  DEFAULT_TRANSFER_BUDGET_CHARACTERS,
} from "./defaults.js";

/** Bumped whenever the meaning of a stored field changes, never for an addition. */
export const CURRENT_WORKSPACE_SCHEMA_VERSION = 1;

/** How many characters of the digest identify a configuration. */
const FINGERPRINT_LENGTH = 8;

/**
 * Constants for the digest below.
 *
 * These are the standard FNV-1a offset and prime, plus one mixing constant from
 * MurmurHash3's finaliser. The algorithm is chosen for having no dependencies
 * and a good spread over small inputs; it is emphatically NOT cryptographic, and
 * nothing secret is ever hashed. This identifies a configuration, it does not
 * protect one.
 */
const DIGEST_OFFSET_BASIS = 0x811c9dc5;
const DIGEST_PRIME = 0x01000193;
const DIGEST_MIXING_CONSTANT = 0x85ebca6b;

/** Hexadecimal, and the width one 32-bit half occupies in it. */
const HEXADECIMAL_RADIX = 16;
const HEX_DIGITS_PER_HALF = 8;

/** How a concept was matched to a Jira field, shown so the choice is auditable. */
export type FieldMatchMethod = "explicit" | "exact-name";

/**
 * What is known about one concept's Jira field.
 *
 * `absent` and `unmapped` are deliberately different. `absent` is a confirmed
 * answer — this instance has no such field — and yields a grey, inapplicable
 * result. `unmapped` is an unanswered question and yields an amber, blocking
 * one. Neither can ever render as a pass.
 */
export type FieldMapEntry =
  | {
      readonly state: "resolved";
      readonly fieldId: string;
      readonly jiraName: string;
      readonly matchedBy: FieldMatchMethod;
      readonly confirmedAtIso: string;
    }
  | { readonly state: "ambiguous"; readonly candidateFieldIds: readonly string[] }
  | { readonly state: "unmapped" }
  | { readonly state: "absent"; readonly confirmedAtIso: string };

/** Every concept's mapping state, whether answered or not. */
export type FieldMap = Readonly<Record<ConceptId, FieldMapEntry>>;

/** Which statuses mean a lens's milestone was reached. */
export type StatusCondition =
  | { readonly kind: "category"; readonly category: "new" | "indeterminate" | "done" }
  | { readonly kind: "named-statuses"; readonly statusNames: readonly string[] };

/** The two identifiers a completion lens may have. */
export type CompletionLensId = "delivered-to-int" | "released-to-prod";

/** A named definition of what counts as finished. */
export interface CompletionLens {
  readonly lensId: CompletionLensId;
  readonly label: string;
  readonly completedWhen: StatusCondition;
  readonly startedWhen: StatusCondition;
}

/** Weekends and holidays, so every duration is working time. */
export interface WorkingCalendar {
  /** Day numbers excluded from working time; 0 is Sunday, 6 is Saturday. */
  readonly weekendDays: readonly number[];
  readonly holidayIsoDates: readonly string[];
}

/** Everything capable of changing a displayed number. */
export interface WorkspaceConfiguration {
  readonly schemaVersion: number;
  readonly fieldMap: FieldMap;
  readonly enabledCheckIds: readonly string[];
  readonly completionLenses: Readonly<Record<CompletionLensId, CompletionLens>>;
  readonly workingCalendar: WorkingCalendar;
  readonly retrievalCeiling: number;
  readonly transferBudgetCharacters: number;
  readonly updatedAtIso: string;
  readonly updatedBy: string;
}

/** Day numbers, as JavaScript reports them. */
const SUNDAY = 0;
const SATURDAY = 6;

/** Weekend days for the default calendar. */
const DEFAULT_WEEKEND_DAYS: readonly number[] = [SUNDAY, SATURDAY];

/** The three checks this feature ships, all enabled until somebody turns one off. */
const DEFAULT_ENABLED_CHECK_IDS: readonly string[] = [
  "missing-story-points",
  "missing-acceptance-criteria",
  "missing-fix-version",
];

/**
 * A configuration with nothing assumed.
 *
 * Every concept starts `unmapped`, and **no default Jira field id ships
 * anywhere**. The predecessor's hardcoded `customfield_10028` was wrong for this
 * instance, so forty-one pointed issues were reported unpointed and accepted
 * fixes wrote into a field nothing reads. Shipping no default means the tool can
 * be unconfigured, but never confidently wrong.
 */
export function buildDefaultWorkspaceConfiguration(): WorkspaceConfiguration {
  const fieldMap = Object.fromEntries(
    ALL_CONCEPT_IDS.map((conceptId) => [conceptId, { state: "unmapped" as const }]),
  ) as FieldMap;

  return {
    schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    fieldMap,
    enabledCheckIds: DEFAULT_ENABLED_CHECK_IDS,
    completionLenses: {
      "delivered-to-int": {
        lensId: "delivered-to-int",
        label: "Delivered to integration test",
        // Left for the team to name, because their definition of done is theirs.
        completedWhen: { kind: "named-statuses", statusNames: [] },
        startedWhen: { kind: "category", category: "indeterminate" },
      },
      "released-to-prod": {
        lensId: "released-to-prod",
        label: "Released to production",
        // Jira's own category, so this lens reconciles with an untouched report.
        completedWhen: { kind: "category", category: "done" },
        startedWhen: { kind: "category", category: "indeterminate" },
      },
    },
    workingCalendar: { weekendDays: DEFAULT_WEEKEND_DAYS, holidayIsoDates: [] },
    retrievalCeiling: DEFAULT_RETRIEVAL_CEILING,
    transferBudgetCharacters: DEFAULT_TRANSFER_BUDGET_CHARACTERS,
    updatedAtIso: "1970-01-01T00:00:00.000Z",
    updatedBy: "",
  };
}

/** Serialises a value with its object keys sorted, so key order cannot alter the digest. */
function stringifyStably(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stringifyStably).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stringifyStably(entryValue)}`);
  return `{${entries.join(",")}}`;
}

/** A small, dependency-free digest. Identity, not security — no secret is hashed. */
function digest(text: string): string {
  // Two independent 32-bit accumulators, so short configurations that differ in
  // one character still produce visibly different fingerprints.
  let hashHigh = DIGEST_OFFSET_BASIS;
  let hashLow = DIGEST_PRIME;

  for (let i = 0; i < text.length; i += 1) {
    const characterCode = text.charCodeAt(i);
    hashHigh = Math.imul(hashHigh ^ characterCode, DIGEST_PRIME) >>> 0;
    hashLow = Math.imul(hashLow + characterCode, DIGEST_MIXING_CONSTANT) >>> 0;
  }

  const highHalf = hashHigh.toString(HEXADECIMAL_RADIX).padStart(HEX_DIGITS_PER_HALF, "0");
  const lowHalf = hashLow.toString(HEXADECIMAL_RADIX).padStart(HEX_DIGITS_PER_HALF, "0");

  return `${highHalf}${lowHalf}`.slice(0, FINGERPRINT_LENGTH);
}

/**
 * The identifier shown in the header and stamped on every result and export.
 *
 * Only content that can change a number is hashed. When and by whom the
 * configuration was saved are excluded deliberately: a fingerprint that churned
 * on every save would teach people to ignore it, and then it would tell them
 * nothing on the day it mattered.
 */
export function computeFingerprint(configuration: WorkspaceConfiguration): string {
  return digest(
    stringifyStably({
      schemaVersion: configuration.schemaVersion,
      fieldMap: configuration.fieldMap,
      enabledCheckIds: [...configuration.enabledCheckIds].sort(),
      completionLenses: configuration.completionLenses,
      workingCalendar: configuration.workingCalendar,
      retrievalCeiling: configuration.retrievalCeiling,
      transferBudgetCharacters: configuration.transferBudgetCharacters,
    }),
  );
}

/** The verdict on a configuration document found on disk. */
export type WorkspaceReview =
  | { readonly status: "current"; readonly configuration: WorkspaceConfiguration }
  | {
      readonly status: "needs-review";
      readonly storedVersion: number;
      readonly expectedVersion: number;
      readonly reason: string;
    }
  | { readonly status: "unreadable"; readonly reason: string };

/** Does this look like a workspace document at all? */
function isWorkspaceShaped(candidate: unknown): candidate is WorkspaceConfiguration {
  if (candidate === null || typeof candidate !== "object") return false;
  const record = candidate as Record<string, unknown>;
  return typeof record.schemaVersion === "number" && typeof record.fieldMap === "object";
}

/**
 * Decides whether a stored configuration may be used as-is.
 *
 * A document written under different rules is reported rather than
 * reinterpreted. Silently reading old values under new meanings is how a
 * configuration comes to say something nobody chose — and the whole point of the
 * fingerprint is that what a number was computed under is knowable.
 */
export function reviewStoredWorkspace(stored: unknown): WorkspaceReview {
  if (!isWorkspaceShaped(stored)) {
    return {
      status: "unreadable",
      reason: "The stored configuration could not be read as a Jira+ workspace document.",
    };
  }

  if (stored.schemaVersion !== CURRENT_WORKSPACE_SCHEMA_VERSION) {
    const direction = stored.schemaVersion < CURRENT_WORKSPACE_SCHEMA_VERSION ? "earlier" : "later";
    return {
      status: "needs-review",
      storedVersion: stored.schemaVersion,
      expectedVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
      reason:
        `This configuration was written by an ${direction} version of Jira+ ` +
        `(version ${stored.schemaVersion}, this application expects ` +
        `${CURRENT_WORKSPACE_SCHEMA_VERSION}). Review it before trusting any number computed ` +
        `under it.`,
    };
  }

  return { status: "current", configuration: stored };
}
