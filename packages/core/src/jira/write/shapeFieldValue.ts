// shapeFieldValue.ts — Jira wants an object where a person sees a word.
//
// A select is chosen by picking a label off a list, and the label is what a
// draft holds. Jira will not take the label. It wants `{ id }` or `{ value }`,
// and each family of field insists on a different key:
//
//   customfield_10234: Cannot construct instance of CustomFieldOptionJsonBean
//                      ... from String value ('Planned - New Capability')
//   customfield_10217: Could not find valid 'id' or 'value' in the Parent
//                      Option object
//   priority:          Could not find valid 'id' or 'name' in priority object
//
// That knowledge already existed in fieldWriters, for editing an issue, and had
// never been applied to creating one — so a create sent every select as a bare
// string and Jira refused the lot.
//
// It is pure on purpose. Shaping a value and sending it are different jobs, and
// keeping them apart is what lets one create, one edit and one fix produce the
// same bytes for the same field.

/** One choice a field offers, as the instance described it. */
export interface AllowedOption {
  readonly optionId: string | null;
  readonly label: string;
  /** A cascading select's second level. Empty for every other field. */
  readonly children: readonly { readonly optionId: string | null; readonly label: string }[];
}

/** Everything needed to shape one value. */
export interface FieldValueShapeInput {
  readonly fieldId: string;
  readonly schemaType: string | null;
  readonly schemaItems: string | null;
  readonly allowedOptions: readonly AllowedOption[] | null;
  readonly value: unknown;
}

/** Field families Jira identifies by `name` rather than by `value`. */
const NAME_KEYED_TYPES: readonly string[] = ["priority", "version", "component", "user", "group"];

/** Field families that are a choice from a list, keyed by `value`. */
const OPTION_TYPES: readonly string[] = ["option", "option-with-child"];

/** Is this already the object Jira asked for? */
function isAlreadyShaped(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

/** The option whose label this is, and the parent it hangs under. */
function findOption(
  options: readonly AllowedOption[],
  label: string,
): { readonly option: AllowedOption; readonly child: { optionId: string | null } | null } | null {
  const direct = options.find((candidate) => candidate.label === label);
  if (direct !== undefined) return { option: direct, child: null };

  for (const parent of options) {
    const child = parent.children.find((candidate) => candidate.label === label);
    // Sent without the parent it hangs under, a child is exactly the "Parent
    // Option object" Jira says it cannot find.
    if (child !== undefined) return { option: parent, child };
  }
  return null;
}

/** One choice, in the shape its field family accepts. */
function shapeOneChoice(input: FieldValueShapeInput, label: string, effectiveType: string): unknown {
  // The family, not the container: a list of versions is still versions, and
  // reading "array" here sent every one of them under the wrong key.
  const key = NAME_KEYED_TYPES.includes(effectiveType) ? "name" : "value";
  const match = input.allowedOptions === null ? null : findOption(input.allowedOptions, label);

  if (match === null || match.option.optionId === null) return { [key]: label };

  // The id wherever the instance gave us one: two options can share a label,
  // and nothing shares an id.
  if (match.child === null) return { id: match.option.optionId };
  return { id: match.option.optionId, child: { id: match.child.optionId } };
}

/** Does this field want an object rather than the word itself? */
function doesFieldWantAnObject(schemaType: string | null, itemType: string | null): boolean {
  const type = schemaType === "array" ? itemType : schemaType;
  return type !== null && (OPTION_TYPES.includes(type) || NAME_KEYED_TYPES.includes(type));
}

/**
 * Puts one value into the shape Jira's create endpoint will accept.
 *
 * Returns null when there is nothing to send, so a caller can leave the field
 * out entirely rather than writing an empty one over something.
 */
export function shapeFieldValueForJira(input: FieldValueShapeInput): unknown {
  if (input.value === null || input.value === undefined) return null;
  if (typeof input.value === "string" && input.value.trim().length === 0) return null;

  const itemType = input.schemaType === "array" ? input.schemaItems : null;
  const isList = input.schemaType === "array";

  if (!doesFieldWantAnObject(input.schemaType, itemType)) {
    // Text, numbers, dates and plain word lists were never the problem, and
    // wrapping a summary in an object would break every create that works.
    return input.value;
  }

  const effectiveType = (isList ? itemType : input.schemaType) ?? "";
  const rawChoices = Array.isArray(input.value) ? input.value : [input.value];
  const shaped = rawChoices.map((choice) =>
    isAlreadyShaped(choice) ? choice : shapeOneChoice(input, String(choice), effectiveType),
  );

  return isList ? shaped : (shaped[0] ?? null);
}

/** What a create screen said, when it could be read. */
interface ShapeSource {
  readonly status: string;
  readonly fields?: readonly {
    readonly fieldId: string;
    readonly schemaType: string | null;
    readonly schemaItems: string | null;
    readonly allowedOptions: readonly AllowedOption[] | null;
  }[];
}

/**
 * Shapes every value in a draft against what the instance said its fields are.
 *
 * A field the create screen never mentioned is sent exactly as written: dropping
 * it would silently lose somebody's work, and guessing its shape would be the
 * same mistake in the other direction. Sent as written, a wrong one fails
 * loudly, in Jira's own words.
 */
export function shapeCreateFields(
  shape: ShapeSource | null,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  // No shape at all is the same answer as an unreadable one: send what we
  // have and let Jira refuse it in its own words, never invent a shape.
  const fields = shape !== null && shape.status === "known" ? (shape.fields ?? []) : [];
  const shaped: Record<string, unknown> = {};

  for (const [fieldId, value] of Object.entries(values)) {
    const known = fields.find((field) => field.fieldId === fieldId);
    if (known === undefined) {
      shaped[fieldId] = value;
      continue;
    }

    const result = shapeFieldValueForJira({
      fieldId,
      schemaType: known.schemaType,
      schemaItems: known.schemaItems,
      allowedOptions: known.allowedOptions,
      value,
    });
    // Left out entirely rather than written empty: an empty select written over
    // an existing one is a silent deletion.
    if (result !== null) shaped[fieldId] = result;
  }

  return shaped;
}
