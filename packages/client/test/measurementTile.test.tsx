// measurementTile.test.tsx — Three zeros must look like three different answers.
//
// The predecessor drew a bare `0` for "all clean", "nothing here applies" and
// "the field could not be found", identically. This suite asserts the three are
// distinguishable by TEXT, not merely by colour — because a person reading a
// greyscale screenshot, or one of the many who cannot separate green from
// amber, must still know which they are looking at.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildIssueSet, buildRetrievalRecord, measure, normaliseRawIssue } from "@jira-plus/core";
import type { Measure, RetrievalFailure } from "@jira-plus/core";

import { MeasurementTile } from "../src/components/MeasurementTile.js";

afterEach(cleanup);

/** An issue set holding the given keys. */
function buildSet(keys: readonly string[], totalMatchingCount = keys.length, failure: RetrievalFailure | null = null) {
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: failure === null ? totalMatchingCount : 0,
    fetchedCount: failure === null ? keys.length : 0,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure,
  });
  const issues = failure === null
    ? keys.map((key) => normaliseRawIssue({ id: key, key, fields: { status: { statusCategory: { key: "new" } } } }, {}))
    : [];
  return buildIssueSet(record, issues);
}

/** Builds each of the states the tile must tell apart. */
function buildMeasureFor(kind: "pass" | "attention" | "not-applicable" | "unresolved"): Measure {
  const keys = ["ENCUC-1", "ENCUC-2", "ENCUC-3"];

  if (kind === "unresolved") {
    return measure({
      sourceId: "missing-acceptance-criteria",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildSet([], 0, { kind: "jql-error", jiraMessages: ["Field 'cf[99999]' does not exist"] }),
    });
  }

  if (kind === "not-applicable") {
    return measure({
      sourceId: "missing-target-date",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildSet(keys),
    });
  }

  return measure({
    sourceId: "missing-story-points",
    flaggedKeys: kind === "pass" ? [] : ["ENCUC-1"],
    eligibleKeys: keys,
    issueSet: buildSet(keys),
  });
}

describe("the three zeros are three different answers", () => {
  it("shows a genuine all-clear as a pass, with its denominator", () => {
    render(<MeasurementTile measure={buildMeasureFor("pass")} title="Missing story points" />);

    expect(screen.getByText("0 of 3")).toBeTruthy();
    expect(screen.getByText(/all clear/i)).toBeTruthy();
  });

  it("shows an empty population as 'nothing in scope', not as a pass", () => {
    render(<MeasurementTile measure={buildMeasureFor("not-applicable")} title="Missing target date" />);

    expect(screen.getByText("0 of 0")).toBeTruthy();
    // The phrase appears twice by design: once as the state label, once in the
    // sentence explaining it. Both are wanted; neither may say "all clear".
    expect(screen.getAllByText(/nothing in scope/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/all clear/i)).toBeNull();
  });

  it("shows an unresolvable check as 'can't be measured', never as green", () => {
    render(<MeasurementTile measure={buildMeasureFor("unresolved")} title="Missing acceptance criteria" />);

    expect(screen.getByText(/can't be measured/i)).toBeTruthy();
    expect(screen.queryByText(/all clear/i)).toBeNull();
    expect(screen.queryByText(/0 of/)).toBeNull();
  });

  it("labels every state in words, so colour is never the only signal", () => {
    for (const kind of ["pass", "attention", "not-applicable", "unresolved"] as const) {
      cleanup();
      render(<MeasurementTile measure={buildMeasureFor(kind)} title="A check" />);
      const stateTexts = screen.getAllByText(
        /all clear|needs attention|nothing in scope|can't be measured/i,
      );

      expect(stateTexts.length).toBeGreaterThan(0);
      expect(stateTexts[0]?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries a distinct data-state for each, so a screenshot is diagnosable", () => {
    const states = new Set<string>();
    for (const kind of ["pass", "attention", "not-applicable", "unresolved"] as const) {
      cleanup();
      const { container } = render(<MeasurementTile measure={buildMeasureFor(kind)} title="A check" />);
      states.add(container.querySelector("article")?.getAttribute("data-state") ?? "");
    }

    expect(states.size).toBeGreaterThanOrEqual(3);
  });
});

describe("a failed retrieval poisons the tile", () => {
  it("names the reason rather than showing a figure", () => {
    render(<MeasurementTile measure={buildMeasureFor("unresolved")} title="Missing acceptance criteria" />);

    expect(screen.getByText(/query failed/i)).toBeTruthy();
  });

  it("names an unmapped concept and does not evaluate the check", () => {
    const unmapped = measure({
      sourceId: "missing-acceptance-criteria",
      flaggedKeys: [],
      eligibleKeys: [],
      issueSet: buildSet(["ENCUC-1"]),
      blocker: { kind: "concept-unmapped", conceptIds: ["acceptanceCriteria"] },
    });

    render(<MeasurementTile measure={unmapped} title="Missing acceptance criteria" />);

    expect(screen.getByText(/no jira field is mapped to acceptanceCriteria/i)).toBeTruthy();
  });
});

describe("the count and its drill-through are the same list", () => {
  it("hands back exactly the keys it counted", async () => {
    const onOpenFlagged = vi.fn();
    render(
      <MeasurementTile
        measure={buildMeasureFor("attention")}
        title="Missing story points"
        onOpenFlagged={onOpenFlagged}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "1 of 3" }));

    expect(onOpenFlagged).toHaveBeenCalledWith(["ENCUC-1"]);
  });

  it("hands back the population, so a wrong denominator is visible", async () => {
    const onOpenPopulation = vi.fn();
    render(
      <MeasurementTile
        measure={buildMeasureFor("pass")}
        title="Missing story points"
        onOpenPopulation={onOpenPopulation}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /what does this apply to/i }));

    expect(onOpenPopulation).toHaveBeenCalledWith(["ENCUC-1", "ENCUC-2", "ENCUC-3"]);
  });

  it("offers no drill-through when there is nothing to drill into", () => {
    render(<MeasurementTile measure={buildMeasureFor("not-applicable")} title="A check" />);

    expect(screen.queryByRole("button", { name: /what does this apply to/i })).toBeNull();
  });
});

describe("a truncated retrieval announces itself as a floor", () => {
  it("says the figure is at least this much", () => {
    const partial = measure({
      sourceId: "missing-story-points",
      flaggedKeys: ["ENCUC-1"],
      eligibleKeys: ["ENCUC-1", "ENCUC-2"],
      issueSet: buildSet(["ENCUC-1", "ENCUC-2"], 4_317),
    });

    render(<MeasurementTile measure={partial} title="Missing story points" />);

    expect(screen.getByText(/at least; the retrieval was incomplete/i)).toBeTruthy();
  });
});
