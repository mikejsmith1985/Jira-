// SimpleSearchPanel.test.tsx — The search for everybody who does not write JQL.
//
// JQL is a real barrier, and telling people to learn it first is how a tool ends
// up used by one person. This is the default way in.
//
// The property that keeps it honest is that the query it builds is ON SCREEN.
// It is a way to WRITE a query, never a second way to ask Jira — so a number a
// beginner produced carries the same visible, re-runnable query as anybody
// else's, and a search that found the wrong thing can be read and corrected
// rather than merely distrusted.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEmptyCriteria } from "@jira-plus/core";
import type { SimpleSearchCriteria } from "@jira-plus/core";

import { SimpleSearchPanel } from "../src/components/SimpleSearchPanel.js";

afterEach(cleanup);

const CHOICES = {
  projects: [
    { projectKey: "ENCUC", name: "Enrollment Customer" },
    { projectKey: "DENP", name: "Enrollment Program" },
  ],
  issueTypes: [
    { issueTypeId: "1", name: "Defect", isSubtask: false },
    { issueTypeId: "2", name: "Story", isSubtask: false },
  ],
  statuses: [
    { name: "Working", statusCategoryKey: "indeterminate" },
    { name: "Closed", statusCategoryKey: "done" },
  ],
};

/** Renders the panel over some criteria. */
function renderPanel(criteria: SimpleSearchCriteria = buildEmptyCriteria(), overrides = {}) {
  const handlers = { onChange: vi.fn(), onSearch: vi.fn(), onEditAsJql: vi.fn(), ...overrides };
  render(
    <SimpleSearchPanel
      criteria={criteria}
      choices={CHOICES}
      isRetrieving={false}
      onChange={handlers.onChange as never}
      onSearch={handlers.onSearch as never}
      onEditAsJql={handlers.onEditAsJql as never}
    />,
  );
  return handlers;
}

describe("the query it builds", () => {
  it("is on screen, so a search can be read rather than merely trusted", () => {
    renderPanel({ ...buildEmptyCriteria(), projectKeys: ["ENCUC"] });

    expect(screen.getByText(/project = ENCUC/)).toBeTruthy();
  });

  it("says plainly that nothing has been chosen, rather than showing an empty box", () => {
    renderPanel();

    expect(screen.getByText(/choose something to search for/i)).toBeTruthy();
  });

  it("can be handed to the JQL box, the way Jira lets you", () => {
    // The path from beginner to writing your own: start here, see the query,
    // then take it over.
    const handlers = renderPanel({ ...buildEmptyCriteria(), projectKeys: ["ENCUC"] });

    return userEvent
      .click(screen.getByRole("button", { name: /edit as jql/i }))
      .then(() => {
        expect(handlers.onEditAsJql).toHaveBeenCalledWith(
          "project = ENCUC ORDER BY updated DESC",
        );
      });
  });
});

describe("choosing what to search", () => {
  it("offers the projects the instance actually has", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /Enrollment Customer/ })).toBeTruthy();
  });

  it("offers the issue types", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /^Defect$/ })).toBeTruthy();
  });

  it("offers the statuses", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /^Working$/ })).toBeTruthy();
  });

  it("adds a choice to what is already chosen rather than replacing it", async () => {
    // Picking a second project should mean both, which is the whole reason this
    // is not a dropdown.
    const handlers = renderPanel({ ...buildEmptyCriteria(), projectKeys: ["ENCUC"] });

    await userEvent.click(screen.getByRole("button", { name: /Enrollment Program/ }));

    expect(handlers.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ projectKeys: ["ENCUC", "DENP"] }),
    );
  });

  it("removes a choice when it is picked again", async () => {
    const handlers = renderPanel({ ...buildEmptyCriteria(), projectKeys: ["ENCUC"] });

    await userEvent.click(screen.getByRole("button", { name: /Enrollment Customer/ }));

    expect(handlers.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ projectKeys: [] }),
    );
  });

  it("shows which ones are chosen, so the search is not a guess", () => {
    renderPanel({ ...buildEmptyCriteria(), projectKeys: ["ENCUC"] });

    expect(
      screen.getByRole("button", { name: /Enrollment Customer/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("running it", () => {
  it("will not search for nothing", () => {
    // An empty builder that means "every issue in the instance" retrieves tens
    // of thousands of issues by touching nothing.
    renderPanel();

    const button = screen.getByRole("button", { name: /^search$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("hands over the query it showed, not something else", async () => {
    const handlers = renderPanel({ ...buildEmptyCriteria(), projectKeys: ["ENCUC"] });

    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(handlers.onSearch).toHaveBeenCalledWith("project = ENCUC ORDER BY updated DESC");
  });
});

describe("when Jira's own lists could not be read", () => {
  it("says so rather than showing an empty set of choices", () => {
    // An empty list of projects and an unreachable Jira must never read alike:
    // one means you can see nothing, the other means we do not know.
    render(
      <SimpleSearchPanel
        criteria={buildEmptyCriteria()}
        choices={null}
        isRetrieving={false}
        onChange={vi.fn() as never}
        onSearch={vi.fn() as never}
        onEditAsJql={vi.fn() as never}
      />,
    );

    expect(screen.getByText(/could not be read/i)).toBeTruthy();
  });
});
