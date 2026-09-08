// SourcesPanel.test.tsx — Gathered material cannot become an issue by itself.
//
// A source has no field id. That is a property of the shape rather than a rule
// this component enforces, and the assertion below is here so a later edit that
// tried to "helpfully" prefill the summary from a pasted brief would fail — an
// email someone pasted becoming an issue nobody wrote is the failure worth
// preventing.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEmptyDraft } from "@jira-plus/core";

import { SourcesPanel } from "../src/components/authoring/SourcesPanel.js";

afterEach(cleanup);

const NOW = "2026-09-08T09:14:00.000Z";

describe("gathering", () => {
  it("keeps what was pasted, under the label it was given", async () => {
    const onChange = vi.fn();
    render(<SourcesPanel draft={buildEmptyDraft(NOW)} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/what is it/i), "the brief");
    await userEvent.type(screen.getByLabelText(/paste it here/i), "Members cannot see it.");
    await userEvent.click(screen.getByRole("button", { name: /add it/i }));

    const [next] = onChange.mock.calls[0] as [{ sources: { label: string; text: string }[] }];
    expect(next.sources.at(0)?.label).toBe("the brief");
    expect(next.sources.at(0)?.text).toBe("Members cannot see it.");
  });

  it("changes no issue field when a source is added", async () => {
    // The property this panel exists to preserve.
    const onChange = vi.fn();
    render(<SourcesPanel draft={buildEmptyDraft(NOW)} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/paste it here/i), "Members cannot see it.");
    await userEvent.click(screen.getByRole("button", { name: /add it/i }));

    const [next] = onChange.mock.calls[0] as [{ summary: string; description: string }];
    expect(next.summary).toBe("");
    expect(next.description).toBe("");
  });

  it("names an unlabelled source rather than leaving it blank in the list", async () => {
    const onChange = vi.fn();
    render(<SourcesPanel draft={buildEmptyDraft(NOW)} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/paste it here/i), "Some text.");
    await userEvent.click(screen.getByRole("button", { name: /add it/i }));

    const [next] = onChange.mock.calls[0] as [{ sources: { label: string }[] }];
    expect(next.sources.at(0)?.label).toBe("Untitled");
  });

  it("refuses to add an empty source", async () => {
    const onChange = vi.fn();
    render(<SourcesPanel draft={buildEmptyDraft(NOW)} onChange={onChange} />);

    expect((screen.getByRole("button", { name: /add it/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("what is already gathered", () => {
  it("is shown with its label and its text, beside the draft", () => {
    const draft = {
      ...buildEmptyDraft(NOW),
      sources: [{ sourceId: "s1", label: "the brief", text: "Members cannot see it.", addedAtIso: NOW }],
    };

    render(<SourcesPanel draft={draft} onChange={vi.fn()} />);

    expect(screen.getByText("the brief")).toBeTruthy();
    expect(screen.getByText(/members cannot see it/i)).toBeTruthy();
  });

  it("can be removed", async () => {
    const onChange = vi.fn();
    const draft = {
      ...buildEmptyDraft(NOW),
      sources: [{ sourceId: "s1", label: "the brief", text: "T", addedAtIso: NOW }],
    };
    render(<SourcesPanel draft={draft} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));

    const [next] = onChange.mock.calls[0] as [{ sources: unknown[] }];
    expect(next.sources).toHaveLength(0);
  });

  it("says nothing is gathered yet, rather than showing an empty list", () => {
    render(<SourcesPanel draft={buildEmptyDraft(NOW)} onChange={vi.fn()} />);

    expect(screen.getByText(/nothing gathered yet/i)).toBeTruthy();
  });
});
