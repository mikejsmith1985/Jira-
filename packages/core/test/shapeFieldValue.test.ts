// shapeFieldValue.test.ts — Jira wants objects where a person sees a word.
//
// Once the identity fields were fixed, Jira's next refusal was this, verbatim:
//
//   customfield_10234: Cannot construct instance of CustomFieldOptionJsonBean
//                      ... from String value ('Planned - New Capability')
//   customfield_10217: Could not find valid 'id' or 'value' in the Parent
//                      Option object
//   priority:          Could not find valid 'id' or 'name' in priority object
//
// A select is chosen by picking a label off a list, and the label is what the
// draft holds. Jira will not take the label: it wants { id } or { value }, and
// each family of field wants a different key. That knowledge already existed
// for editing an issue and had never been applied to creating one.
//
// The id is preferred wherever the instance gave us one. Two options can share
// a label; nothing shares an id.

import { describe, expect, it } from "vitest";

import { shapeCreateFields, shapeFieldValueForJira } from "../src/jira/write/shapeFieldValue.js";

/** A select with two options, as createmeta describes one. */
const CAPABILITY = {
  fieldId: "customfield_10234",
  schemaType: "option",
  schemaItems: null,
  allowedOptions: [
    { optionId: "11100", label: "Planned - New Capability", children: [] },
    { optionId: "11101", label: "Unplanned", children: [] },
  ],
};

describe("a single select", () => {
  it("is sent as the option's id, which nothing else shares", () => {
    expect(shapeFieldValueForJira({ ...CAPABILITY, value: "Planned - New Capability" })).toEqual({
      id: "11100",
    });
  });

  it("falls back to the label when the instance gave no id for it", () => {
    // Jira accepts { value } too. It is the weaker of the two and so the
    // fallback, never the first choice.
    expect(
      shapeFieldValueForJira({ ...CAPABILITY, allowedOptions: null, value: "Something else" }),
    ).toEqual({ value: "Something else" });
  });

  it("leaves a value that is already shaped alone", () => {
    // A value loaded from an existing issue arrives shaped. Wrapping it again
    // would produce { value: "[object Object]" }.
    expect(shapeFieldValueForJira({ ...CAPABILITY, value: { id: "11101" } })).toEqual({
      id: "11101",
    });
  });
});

describe("a cascading select", () => {
  const CASCADING = {
    fieldId: "customfield_10217",
    schemaType: "option-with-child",
    schemaItems: null,
    allowedOptions: [
      {
        optionId: "12000",
        label: "Enrollment",
        children: [{ optionId: "12001", label: "EAM" }],
      },
    ],
  };

  it("sends the parent when the parent was chosen", () => {
    expect(shapeFieldValueForJira({ ...CASCADING, value: "Enrollment" })).toEqual({ id: "12000" });
  });

  it("sends the parent AND the child when a child was chosen", () => {
    // "Could not find valid 'id' or 'value' in the Parent Option object" is what
    // Jira says when a child is sent without the parent it hangs under.
    expect(shapeFieldValueForJira({ ...CASCADING, value: "EAM" })).toEqual({
      id: "12000",
      child: { id: "12001" },
    });
  });
});

describe("the fields Jira names differently", () => {
  it("sends a priority by name, which is the key that field takes", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "priority",
        schemaType: "priority",
        schemaItems: null,
        allowedOptions: null,
        value: "High",
      }),
    ).toEqual({ name: "High" });
  });

  it("sends a version by name", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "fixVersions",
        schemaType: "array",
        schemaItems: "version",
        allowedOptions: null,
        value: "26.4",
      }),
    ).toEqual([{ name: "26.4" }]);
  });

  it("sends a user by name, which is how Data Center identifies one", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "assignee",
        schemaType: "user",
        schemaItems: null,
        allowedOptions: null,
        value: "msmith",
      }),
    ).toEqual({ name: "msmith" });
  });
});

describe("the fields that were never the problem", () => {
  it("leaves text exactly as it was written", () => {
    // The guard is narrow on purpose. Wrapping a summary in an object would
    // break every create that currently works.
    expect(
      shapeFieldValueForJira({
        fieldId: "summary",
        schemaType: "string",
        schemaItems: null,
        allowedOptions: null,
        value: "A real summary",
      }),
    ).toBe("A real summary");
  });

  it("leaves a number alone", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "customfield_10004",
        schemaType: "number",
        schemaItems: null,
        allowedOptions: null,
        value: 5,
      }),
    ).toBe(5);
  });

  it("leaves a plain list of words alone", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "labels",
        schemaType: "array",
        schemaItems: "string",
        allowedOptions: null,
        value: ["regression"],
      }),
    ).toEqual(["regression"]);
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "customfield_10234",
        schemaType: "option",
        schemaItems: null,
        allowedOptions: null,
        value: "",
      }),
    ).toBeNull();
  });
});

describe("a multi-select", () => {
  it("sends each choice as an object, in a list", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "customfield_10301",
        schemaType: "array",
        schemaItems: "option",
        allowedOptions: [{ optionId: "500", label: "Alpha", children: [] }],
        value: ["Alpha"],
      }),
    ).toEqual([{ id: "500" }]);
  });

  it("accepts one choice for a multi-select and still sends a list", () => {
    expect(
      shapeFieldValueForJira({
        fieldId: "customfield_10301",
        schemaType: "array",
        schemaItems: "option",
        allowedOptions: [{ optionId: "500", label: "Alpha", children: [] }],
        value: "Alpha",
      }),
    ).toEqual([{ id: "500" }]);
  });
});

describe("shaping a whole draft's worth of values", () => {
  const SHAPE = {
    status: "known" as const,
    projectKey: "DENP",
    issueTypeId: "10001",
    fields: [
      { fieldId: "summary", name: "Summary", isRequired: true, allowedValues: null, schemaType: "string", schemaItems: null, allowedOptions: null },
      {
        fieldId: "customfield_10234",
        name: "Capability",
        isRequired: false,
        allowedValues: ["Planned - New Capability"],
        schemaType: "option",
        schemaItems: null,
        allowedOptions: [{ optionId: "11100", label: "Planned - New Capability", children: [] }],
      },
    ],
  };

  it("shapes every value the create screen knows about", () => {
    const shaped = shapeCreateFields(SHAPE, {
      summary: "A real summary",
      customfield_10234: "Planned - New Capability",
    });

    expect(shaped).toEqual({
      summary: "A real summary",
      customfield_10234: { id: "11100" },
    });
  });

  it("passes through a field the create screen never mentioned", () => {
    // Dropping it would silently lose somebody's work; guessing at its shape
    // would be the same mistake in the other direction. Sent as written, it
    // fails loudly if it is wrong.
    expect(shapeCreateFields(SHAPE, { customfield_99999: "who knows" })).toEqual({
      customfield_99999: "who knows",
    });
  });

  it("leaves out a value there is nothing to say about", () => {
    // An empty select written over an existing one is a silent deletion.
    expect(shapeCreateFields(SHAPE, { customfield_10234: "" })).toEqual({});
  });

  it("sends everything as written when the create screen could not be read", () => {
    // Not knowing the shapes is a reason to send what we have and let Jira
    // refuse it in its own words, never to invent a shape.
    const unavailable = { status: "unavailable" as const, reason: "Jira could not be reached." };

    expect(shapeCreateFields(unavailable, { summary: "x" })).toEqual({ summary: "x" });
  });
});
