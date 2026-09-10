// createScreenShape.ts — What this instance says a create screen actually offers.
//
// This is the only source of what fields exist for a draft. No field list is
// written down in the product, which is what stops the predecessor's defect
// recurring: a hardcoded field id there bound a check to the wrong field and
// reported clean zeros for months.
//
// One distinction carries the whole module. An empty field list and a failed
// read are DIFFERENT STATES and must never render alike. One means the issue
// type has no fields; the other means we do not know what it has. Collapsing
// them would put an empty form on screen and let somebody conclude their issue
// type is simple, when in fact Jira was unreachable.

/** One field, as the instance describes it. */
export interface CreateScreenField {
  /** The instance's own identifier. Never written down in this product. */
  readonly fieldId: string;
  /** What the instance calls it, so the diff reads as somebody sees Jira. */
  readonly name: string;
  /** Whether the instance will refuse a create without it. */
  readonly isRequired: boolean;
  /** The permitted values, where the field has a fixed set. */
  readonly allowedValues: readonly string[] | null;
}

/** What a project and issue type offer, or why we could not find out. */
export type CreateScreenShape =
  | {
      readonly status: "known";
      readonly projectKey: string;
      readonly issueTypeId: string;
      readonly fields: readonly CreateScreenField[];
    }
  | { readonly status: "unavailable"; readonly reason: string };

/** Fields Jira lists on every create screen that are not the draft's to set. */
const IDENTITY_FIELD_IDS: readonly string[] = ["project", "issuetype", "issueType"];

/** One issue type a project offers. */
export interface IssueTypeChoice {
  readonly issueTypeId: string;
  readonly name: string;
  readonly isSubtask: boolean;
}

/** Reads the allowed values off a field, where it has a fixed set. */
function readAllowedValues(rawField: Record<string, unknown>): readonly string[] | null {
  const allowed = rawField.allowedValues;
  if (!Array.isArray(allowed) || allowed.length === 0) return null;

  return allowed
    .map((candidate) => {
      if (typeof candidate === "string") return candidate;
      if (candidate === null || typeof candidate !== "object") return null;
      const option = candidate as Record<string, unknown>;
      // Jira names an option differently by field type: a value, a name, or a
      // key. Taking the first that is a string keeps this working across all of
      // them without a table of field types to maintain.
      for (const property of ["value", "name", "key"]) {
        if (typeof option[property] === "string") return option[property] as string;
      }
      return null;
    })
    .filter((label): label is string => label !== null);
}

/**
 * Turns the instance's own description of a create screen into a shape.
 *
 * @param rawFields The `fields` object from createmeta, keyed by field id.
 */
export function buildCreateScreenShape(input: {
  readonly projectKey: string;
  readonly issueTypeId: string;
  readonly rawFields: Readonly<Record<string, unknown>>;
}): CreateScreenShape {
  const fields: CreateScreenField[] = [];

  for (const [fieldId, rawValue] of Object.entries(input.rawFields)) {
    if (rawValue === null || typeof rawValue !== "object") continue;
    // Not fields to fill in: they are what decided WHICH create screen this is.
    // Offered as ordinary fields, the assistant filled the issue type in with
    // the word "Feature", and Jira refused the write - correctly, since a word
    // is not an issue type.
    if (IDENTITY_FIELD_IDS.includes(fieldId)) continue;
    const rawField = rawValue as Record<string, unknown>;

    fields.push({
      fieldId,
      name: typeof rawField.name === "string" ? rawField.name : fieldId,
      isRequired: rawField.required === true,
      allowedValues: readAllowedValues(rawField),
    });
  }

  return { status: "known", projectKey: input.projectKey, issueTypeId: input.issueTypeId, fields };
}

/**
 * Says we could not find out, and why.
 *
 * Never an empty field list. A caller that cannot tell "no fields" from "we do
 * not know" will eventually show one as the other.
 */
export function describeUnavailableShape(reason: string): CreateScreenShape {
  return { status: "unavailable", reason };
}

/** The field with this id, or undefined when the instance does not offer it. */
export function findField(
  shape: CreateScreenShape,
  fieldId: string,
): CreateScreenField | undefined {
  if (shape.status !== "known") return undefined;
  return shape.fields.find((field) => field.fieldId === fieldId);
}

/** Every field the instance will refuse a create without. */
export function readRequiredFields(shape: CreateScreenShape): readonly CreateScreenField[] {
  if (shape.status !== "known") return [];
  return shape.fields.filter((field) => field.isRequired);
}

/** Does the instance accept this value for this field? */
export function isAllowedValue(field: CreateScreenField, value: unknown): boolean {
  if (field.allowedValues === null) return true;
  return typeof value === "string" && field.allowedValues.includes(value);
}
