// SectionTemplatePanel.test.tsx — A template somebody can actually change.
//
// The predecessor froze its nine sections into a source module threaded through
// prompt text, reply normalisation and the commit diff. Changing a heading meant
// a release, so nobody changed one, so the template stopped describing how the
// team actually wrote issues.
//
// Two things are asserted beyond the obvious editing. An empty template is a
// VALID choice — free-form prose — rather than a state to be defended against.
// And the panel says out loud that changing it does not move the configuration
// fingerprint, because somebody who believed otherwise would leave a heading
// wrong rather than risk invalidating a number.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDefaultWorkspaceConfiguration } from "@jira-plus/core";
import type { DescriptionSection, WorkspaceConfiguration } from "@jira-plus/core";

import { SectionTemplatePanel } from "../src/components/authoring/SectionTemplatePanel.js";

afterEach(cleanup);

/** Three sections, enough to test order without the noise of nine. */
const THREE: readonly DescriptionSection[] = [
  { heading: "Description", guidance: "The problem." },
  { heading: "Risks", guidance: "What could go wrong." },
  { heading: "Out of Scope", guidance: "What this does not cover." },
];

/** Renders the panel over a configuration carrying those sections. */
function renderPanel(sections: readonly DescriptionSection[] = THREE) {
  const onSave = vi.fn(async () => undefined);
  const configuration: WorkspaceConfiguration = {
    ...buildDefaultWorkspaceConfiguration(),
    descriptionSections: sections,
  };
  render(<SectionTemplatePanel configuration={configuration} onSave={onSave} />);
  return onSave;
}

/** The sections handed to the last save. */
function readSavedSections(onSave: ReturnType<typeof vi.fn>): readonly DescriptionSection[] {
  const [saved] = onSave.mock.calls.at(-1) as [WorkspaceConfiguration];
  return saved.descriptionSections;
}

describe("what ships", () => {
  it("shows the configured sections, in their configured order", () => {
    renderPanel();

    const headings = screen.getAllByLabelText(/^heading$/i) as HTMLInputElement[];

    expect(headings.map((input) => input.value)).toEqual([
      "Description",
      "Risks",
      "Out of Scope",
    ]);
  });

  it("shows the guidance, which is what the assistant is actually told", () => {
    renderPanel();

    const guidance = screen.getAllByLabelText(/what belongs in it/i) as HTMLInputElement[];

    expect(guidance.at(0)?.value).toBe("The problem.");
  });
});

describe("changing it", () => {
  it("adds a section", async () => {
    const onSave = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /add a section/i }));
    await userEvent.click(screen.getByRole("button", { name: /save the template/i }));

    expect(readSavedSections(onSave)).toHaveLength(4);
  });

  it("removes one", async () => {
    const onSave = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /remove risks/i }));
    await userEvent.click(screen.getByRole("button", { name: /save the template/i }));

    expect(readSavedSections(onSave).map((section) => section.heading)).toEqual([
      "Description",
      "Out of Scope",
    ]);
  });

  it("reorders one, because the order is the description's shape", async () => {
    const onSave = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /move risks up/i }));
    await userEvent.click(screen.getByRole("button", { name: /save the template/i }));

    expect(readSavedSections(onSave).map((section) => section.heading)).toEqual([
      "Risks",
      "Description",
      "Out of Scope",
    ]);
  });

  it("cannot move the first section up, or the last one down", () => {
    renderPanel();

    expect((screen.getByRole("button", { name: /move description up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /move out of scope down/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("restores the nine it shipped with", async () => {
    const onSave = renderPanel([]);

    await userEvent.click(screen.getByRole("button", { name: /back to the nine/i }));
    await userEvent.click(screen.getByRole("button", { name: /save the template/i }));

    expect(readSavedSections(onSave)).toHaveLength(9);
  });

  it("stores nothing until Save is pressed", async () => {
    const onSave = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /add a section/i }));

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("an empty template", () => {
  it("is presented as a valid choice, not as a fault", () => {
    renderPanel([]);

    expect(screen.getByText(/that is a valid choice/i)).toBeTruthy();
    expect(screen.getByText(/free-form prose/i)).toBeTruthy();
  });
});

describe("what it says about the fingerprint", () => {
  it("says changing the template does not move it", () => {
    // Somebody who believed otherwise would leave a heading wrong rather than
    // risk invalidating a number they were about to defend.
    renderPanel();

    expect(screen.getByText(/does not change any number/i)).toBeTruthy();
  });
});
