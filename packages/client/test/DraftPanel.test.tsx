// DraftPanel.test.tsx — Four boxes, and the last one is not a Jira field.
//
// "Your own words" is kept with the draft to steer the assistant and to remind
// somebody in a month what they actually meant. It has no field id, so there is
// nowhere for it to reach Jira even by accident — and the panel says so, because
// a box on a form that looks like every other box will be assumed to be one.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEmptyDraft } from "@jira-plus/core";

import { DraftPanel } from "../src/components/authoring/DraftPanel.js";

afterEach(cleanup);

const NOW = "2026-09-08T09:14:00.000Z";

describe("the four boxes", () => {
  it("offers a summary, a description, acceptance criteria and your own words", () => {
    render(<DraftPanel draft={buildEmptyDraft(NOW)} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/^summary$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^description$/i)).toBeTruthy();
    expect(screen.getByLabelText(/acceptance criteria/i)).toBeTruthy();
    expect(screen.getByLabelText(/your own words/i)).toBeTruthy();
  });

  it("says plainly that your own words never reach Jira", () => {
    // Otherwise it reads as a fifth field somebody is filling in for Jira's
    // benefit, and they write it differently.
    render(<DraftPanel draft={buildEmptyDraft(NOW)} onChange={vi.fn()} />);

    expect(screen.getByText(/never written to jira/i)).toBeTruthy();
  });
});

describe("editing", () => {
  it("reports each change rather than holding it privately", async () => {
    const onChange = vi.fn();
    render(<DraftPanel draft={buildEmptyDraft(NOW)} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/^summary$/i), "S");

    expect(onChange).toHaveBeenCalledWith({ summary: "S" });
  });

  it("shows what was already written, so a reload is invisible", () => {
    const draft = { ...buildEmptyDraft(NOW), summary: "Show enrolment status" };

    render(<DraftPanel draft={draft} onChange={vi.fn()} />);

    expect((screen.getByLabelText(/^summary$/i) as HTMLInputElement).value).toBe(
      "Show enrolment status",
    );
  });
});
