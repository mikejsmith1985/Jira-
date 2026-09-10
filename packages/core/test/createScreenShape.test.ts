// createScreenShape.test.ts — "No fields" and "we could not ask" are not the same.
//
// This is the only source of what fields a draft may hold. No field id is
// written down anywhere in the product, which is what stops the predecessor's
// defect recurring: a hardcoded id there bound a check to the wrong field and
// reported clean zeros for months.
//
// The distinction the whole module turns on is easy to collapse and expensive to
// get wrong. An issue type with no fields and a create screen we could not read
// must never render alike — one is a simple type, the other is Jira being
// unreachable, and confusing them puts an empty form on screen right before Jira
// rejects the create for a required field nobody was shown.

import { describe, expect, it } from "vitest";

import {
  buildCreateScreenShape,
  describeUnavailableShape,
  findField,
  isAllowedValue,
  readRequiredFields,
} from "../src/authoring/createScreenShape.js";

describe("reading what the instance offers", () => {
  it("keeps the instance's own name for a field, not its id", () => {
    // The diff has to read the way Jira reads, or somebody checking one against
    // the other is comparing two vocabularies.
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: { customfield_10500: { name: "Initiative Type", required: false } },
    });

    expect(findField(shape, "customfield_10500")?.name).toBe("Initiative Type");
  });

  it("records which fields the instance will refuse a create without", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        summary: { name: "Summary", required: true },
        description: { name: "Description", required: false },
      },
    });

    expect(readRequiredFields(shape).map((field) => field.name)).toEqual(["Summary"]);
  });

  it("falls back to the field id when the instance names it nothing", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: { customfield_10500: { required: false } },
    });

    expect(findField(shape, "customfield_10500")?.name).toBe("customfield_10500");
  });
});

describe("the values a field will accept", () => {
  it("reads them however the instance chose to label them", () => {
    // Jira names an option by value, name or key depending on the field type.
    // Handling all three keeps this working without a table of types to keep.
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        byValue: { name: "A", allowedValues: [{ value: "Run" }] },
        byName: { name: "B", allowedValues: [{ name: "Grow" }] },
        byKey: { name: "C", allowedValues: [{ key: "Transform" }] },
      },
    });

    expect(findField(shape, "byValue")?.allowedValues).toEqual(["Run"]);
    expect(findField(shape, "byName")?.allowedValues).toEqual(["Grow"]);
    expect(findField(shape, "byKey")?.allowedValues).toEqual(["Transform"]);
  });

  it("says a free-text field accepts anything, rather than nothing", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: { summary: { name: "Summary" } },
    });
    const field = findField(shape, "summary");

    expect(field?.allowedValues).toBeNull();
    expect(isAllowedValue(field!, "anything at all")).toBe(true);
  });

  it("refuses a value a select would reject, so it is never sent", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: { pick: { name: "Pick", allowedValues: [{ value: "Run" }] } },
    });

    expect(isAllowedValue(findField(shape, "pick")!, "Invented")).toBe(false);
  });
});

describe("when we could not ask", () => {
  it("says so, and carries the reason", () => {
    const shape = describeUnavailableShape("Jira could not be reached.");

    expect(shape.status).toBe("unavailable");
  });

  it("is a different state from an issue type that genuinely has no fields", () => {
    // The distinction this module exists to preserve.
    const empty = buildCreateScreenShape({ projectKey: "DENP", issueTypeId: "10001", rawFields: {} });
    const unknown = describeUnavailableShape("Jira could not be reached.");

    expect(empty.status).toBe("known");
    expect(unknown.status).toBe("unavailable");
  });

  it("reports no required fields rather than pretending it knows there are none", () => {
    // A caller reading "no required fields" off an unavailable shape would let a
    // create through that Jira is about to refuse.
    expect(readRequiredFields(describeUnavailableShape("nope"))).toHaveLength(0);
    expect(findField(describeUnavailableShape("nope"), "summary")).toBeUndefined();
  });
});

describe("the fields that decide WHICH issue this is", () => {
  // Jira's createmeta lists project and issue type among the create screen's
  // fields, and both were offered as ordinary editable fields. The assistant
  // duly filled the issue type in with the word "Feature", the draft's values
  // were spread over the identity the create target had chosen, and Jira
  // refused the whole write:
  //
  //   issuetype: Cannot construct instance of ResourceRef ... from String
  //              value ('Feature')
  //   project:   project is required
  //
  // They are not fields to fill in. They are the thing that decided which
  // create screen this is.
  it("does not offer the issue type as a field to fill in", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        issuetype: { name: "Issue Type", required: true },
        summary: { name: "Summary", required: true },
      },
    });

    expect(shape.status === "known" && shape.fields.map((field) => field.fieldId)).toEqual([
      "summary",
    ]);
  });

  it("does not offer the project either", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: { project: { name: "Project", required: true }, summary: { name: "S" } },
    });

    expect(shape.status === "known" && shape.fields.some((f) => f.fieldId === "project")).toBe(
      false,
    );
  });
});

describe("what kind of field each one is", () => {
  // Thrown away until now, and it is the half that decides how a value is sent.
  // Without it every select left as a bare string and Jira refused all of them.
  it("keeps the field's type, so a value can be shaped the way Jira wants it", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        customfield_10234: { name: "Capability", schema: { type: "option" } },
        labels: { name: "Labels", schema: { type: "array", items: "string" } },
      },
    });

    const fields = shape.status === "known" ? shape.fields : [];
    expect(fields.find((field) => field.fieldId === "customfield_10234")?.schemaType).toBe("option");
    expect(fields.find((field) => field.fieldId === "labels")?.schemaItems).toBe("string");
  });

  it("keeps each option's id, because two options can share a label", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        customfield_10234: {
          name: "Capability",
          schema: { type: "option" },
          allowedValues: [{ id: "11100", value: "Planned - New Capability" }],
        },
      },
    });

    const field = shape.status === "known" ? shape.fields[0] : undefined;
    expect(field?.allowedOptions?.[0]).toEqual({
      optionId: "11100",
      label: "Planned - New Capability",
      children: [],
    });
  });

  it("keeps a cascading select's second level, which cannot be sent without its parent", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        customfield_10217: {
          name: "Area",
          schema: { type: "option-with-child" },
          allowedValues: [
            { id: "12000", value: "Enrollment", children: [{ id: "12001", value: "EAM" }] },
          ],
        },
      },
    });

    const field = shape.status === "known" ? shape.fields[0] : undefined;
    expect(field?.allowedOptions?.[0]?.children).toEqual([{ optionId: "12001", label: "EAM" }]);
  });
});
