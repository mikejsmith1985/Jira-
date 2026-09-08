// ReadinessPanel.test.tsx — Advice that must not look like a refusal.
//
// Rendering advice and refusals the same way makes people ignore both: advice
// that looks like a refusal trains somebody to dismiss real refusals, and a real
// refusal dressed as advice gets dismissed.
//
// So this panel never wears the error tone, never disables anything, and says in
// words that it will not stop a write. The reasons a write is actually refused
// live with the diff, in red, where they belong.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ReadinessAssessment } from "@jira-plus/core";

import { ReadinessPanel } from "../src/components/authoring/ReadinessPanel.js";

afterEach(cleanup);

/** An assessment with one finding and one check that could not run. */
const MIXED: ReadinessAssessment = {
  findings: [
    {
      checkId: "needs-summary",
      title: "No summary",
      whyItMatters: "Nobody can recognise the issue in a list without one.",
      isAdvisory: true,
    },
  ],
  unassessed: [
    {
      checkId: "needs-criteria",
      title: "No acceptance criteria",
      reason: "acceptanceCriteria is not mapped on this Jira, so this cannot be assessed.",
    },
  ],
};

describe("what it says", () => {
  it("names each finding and why it matters", () => {
    render(<ReadinessPanel assessment={MIXED} />);

    expect(screen.getByText("No summary")).toBeTruthy();
    expect(screen.getByText(/recognise the issue in a list/i)).toBeTruthy();
  });

  it("says in words that none of it stops a write", () => {
    render(<ReadinessPanel assessment={MIXED} />);

    expect(screen.getByText(/advice, not a gate/i)).toBeTruthy();
  });

  it("points at where the real refusals appear", () => {
    render(<ReadinessPanel assessment={MIXED} />);

    expect(screen.getByText(/appear with the diff, in red/i)).toBeTruthy();
  });
});

describe("a check that could not run", () => {
  it("says so, and says it is not the same as passing", () => {
    // A check that silently did not run reads exactly like a check that passed.
    render(<ReadinessPanel assessment={MIXED} />);

    expect(screen.getByText(/not the same as passing them/i)).toBeTruthy();
    expect(screen.getByText(/is not mapped on this Jira/i)).toBeTruthy();
  });
});

describe("what it never does", () => {
  it("renders no button, so it cannot become an action", () => {
    render(<ReadinessPanel assessment={MIXED} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never wears the error tone, which belongs to real refusals", () => {
    const { container } = render(<ReadinessPanel assessment={MIXED} />);

    expect(container.querySelector(".notice--error")).toBeNull();
  });

  it("renders nothing at all when there is nothing to say", () => {
    // An empty advisory panel is noise on every screen it appears on.
    const { container } = render(
      <ReadinessPanel assessment={{ findings: [], unassessed: [] }} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
