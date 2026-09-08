// CreateTargetPanel.test.tsx — Where the issue goes, and which action this is.
//
// This panel owns the field the whole feature turns on, so what it says has to
// match what will happen. It reads that from the same single field the change
// set does, which is why they cannot disagree.
//
// The other thing asserted here is a distinction that is easy to collapse and
// expensive to get wrong: an issue type with no fields and a create screen we
// could not read are different states. Rendering them alike would show an empty
// form and let somebody conclude their issue type is simple, when in fact Jira
// was unreachable and a required field is about to reject the create.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCreateScreenShape, buildEmptyDraft, describeUnavailableShape } from "@jira-plus/core";
import type { AuthoringDraft } from "@jira-plus/core";

import { CreateTargetPanel } from "../src/components/authoring/CreateTargetPanel.js";

afterEach(cleanup);

const NOW = "2026-09-08T09:14:00.000Z";

/** Renders the panel over a draft. */
function renderPanel(draft: AuthoringDraft, shape = null as Parameters<typeof CreateTargetPanel>[0]["shape"]) {
  return render(
    <CreateTargetPanel
      draft={draft}
      issueTypes={[{ issueTypeId: "10001", name: "Feature", isSubtask: false }]}
      shape={shape}
      isEnriching={draft.existingIssueKey !== null}
      onChange={vi.fn()}
    />,
  );
}

describe("saying which action this is", () => {
  it("says a new issue when no key names an existing one", () => {
    renderPanel(buildEmptyDraft(NOW));

    expect(screen.getByText(/writing a new issue/i)).toBeTruthy();
  });

  it("names the issue it will update, and promises not to create a second", () => {
    renderPanel({ ...buildEmptyDraft(NOW), existingIssueKey: "ENCUC-1142" });

    expect(screen.getByText(/updating ENCUC-1142/i)).toBeTruthy();
    expect(screen.getByText(/will not create a second one/i)).toBeTruthy();
  });

  it("hides the project and type choices while enriching, since the issue has its own", () => {
    renderPanel({ ...buildEmptyDraft(NOW), existingIssueKey: "ENCUC-1142" });

    expect(screen.queryByLabelText(/create in project/i)).toBeNull();
  });
});

describe("what the instance requires", () => {
  it("names the required fields, from the instance rather than from a list here", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: {
        summary: { name: "Summary", required: true },
        description: { name: "Description", required: false },
      },
    });

    renderPanel({ ...buildEmptyDraft(NOW), projectKey: "DENP", issueTypeId: "10001" }, shape);

    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.queryByText("Description")).toBeNull();
  });

  it("says it could not read the create screen, rather than showing no fields", () => {
    // The distinction that must not collapse. An empty form here would let
    // somebody conclude their issue type is simple when Jira was unreachable.
    renderPanel(
      { ...buildEmptyDraft(NOW), projectKey: "DENP", issueTypeId: "10001" },
      describeUnavailableShape("Jira could not be reached."),
    );

    expect(screen.getByText(/could not read what this issue type requires/i)).toBeTruthy();
    expect(screen.getByText(/nothing is written while that is unknown/i)).toBeTruthy();
  });

  it("shows an issue type with genuinely no required fields as exactly that", () => {
    const shape = buildCreateScreenShape({
      projectKey: "DENP",
      issueTypeId: "10001",
      rawFields: { description: { name: "Description", required: false } },
    });

    renderPanel({ ...buildEmptyDraft(NOW), projectKey: "DENP", issueTypeId: "10001" }, shape);

    expect(screen.getByText(/jira requires these/i)).toBeTruthy();
    expect(screen.queryByText(/could not read/i)).toBeNull();
  });
});
