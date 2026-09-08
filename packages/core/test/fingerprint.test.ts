// fingerprint.test.ts — The eight characters two people compare.
//
// Each person runs their own copy of Jira+, so there is no shared store to make
// them agree. The fingerprint does not prevent divergence; it makes divergence
// visible BEFORE anyone argues about a number. That only works if it changes
// when something meaningful changes and stays put when nothing does — a
// fingerprint that churns on every save teaches people to ignore it.

import { describe, expect, it } from "vitest";

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  buildDefaultWorkspaceConfiguration,
  computeFingerprint,
  reviewStoredWorkspace,
} from "../src/workspace/workspaceConfig.js";

describe("computeFingerprint", () => {
  it("gives identical configurations an identical fingerprint", () => {
    expect(computeFingerprint(buildDefaultWorkspaceConfiguration())).toBe(
      computeFingerprint(buildDefaultWorkspaceConfiguration()),
    );
  });

  it("is eight characters, short enough to read down a phone line", () => {
    expect(computeFingerprint(buildDefaultWorkspaceConfiguration())).toHaveLength(8);
  });

  it("ignores when the configuration was saved, so re-saving nothing changes nothing", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const resaved = { ...original, updatedAtIso: "2027-01-01T00:00:00.000Z" };

    expect(computeFingerprint(resaved)).toBe(computeFingerprint(original));
  });

  it("ignores who saved it, for the same reason", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const savedByAnother = { ...original, updatedBy: "someone-else" };

    expect(computeFingerprint(savedByAnother)).toBe(computeFingerprint(original));
  });

  it("changes when a field mapping changes, because that changes what is read", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const remapped = {
      ...original,
      fieldMap: {
        ...original.fieldMap,
        storyPoints: {
          state: "resolved" as const,
          fieldId: "customfield_10236",
          jiraName: "Story Points",
          matchedBy: "exact-name" as const,
          confirmedAtIso: "2026-09-01T00:00:00.000Z",
        },
      },
    };

    expect(computeFingerprint(remapped)).not.toBe(computeFingerprint(original));
  });

  it("changes when a check is disabled, because that changes what is reported", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const withoutOneCheck = { ...original, enabledCheckIds: ["missing-fix-version"] };

    expect(computeFingerprint(withoutOneCheck)).not.toBe(computeFingerprint(original));
  });

  it("changes when a completion lens is redefined, because that changes every chart", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const redefined = {
      ...original,
      completionLenses: {
        ...original.completionLenses,
        "delivered-to-int": {
          ...original.completionLenses["delivered-to-int"],
          completedWhen: { kind: "named-statuses" as const, statusNames: ["Ready for QA"] },
        },
      },
    };

    expect(computeFingerprint(redefined)).not.toBe(computeFingerprint(original));
  });

  it("changes when a board refinement changes, because it changes what a column shows", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const refined = {
      ...original,
      boardRefinements: [
        {
          refinementId: "test-stage",
          refinesColumnName: "Testing",
          splitByConcept: "programIncrement" as const,
          unclassifiedLabel: "Unclassified",
          bands: [{ bandId: "int", label: "Internal", equalsAnyOf: ["Internal"] }],
        },
      ],
    };

    expect(computeFingerprint(refined)).not.toBe(computeFingerprint(original));
  });

  it("changes when a card marker changes, because it changes what a card shows", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const marked = {
      ...original,
      cardMarkers: [
        {
          markerId: "code-review",
          label: "In code review",
          childIssueTypeNames: ["Sub-task"],
          childSummaryContains: "code review",
        },
      ],
    };

    expect(computeFingerprint(marked)).not.toBe(computeFingerprint(original));
  });

  it("changes when the working calendar changes, because it changes every duration", () => {
    const original = buildDefaultWorkspaceConfiguration();
    const withHoliday = {
      ...original,
      workingCalendar: { ...original.workingCalendar, holidayIsoDates: ["2026-12-25"] },
    };

    expect(computeFingerprint(withHoliday)).not.toBe(computeFingerprint(original));
  });

  it("does not depend on the order keys happen to be written in", () => {
    const original = buildDefaultWorkspaceConfiguration();
    // Deliberately enumerated rather than spread, so a field added to the
    // configuration without being considered here fails this test rather than
    // slipping silently into or out of the fingerprint.
    const reordered = {
      updatedBy: original.updatedBy,
      workingCalendar: original.workingCalendar,
      cardMarkers: original.cardMarkers,
      enabledCheckIds: original.enabledCheckIds,
      schemaVersion: original.schemaVersion,
      retrievalCeiling: original.retrievalCeiling,
      boardRefinements: original.boardRefinements,
      transferBudgetCharacters: original.transferBudgetCharacters,
      completionLenses: original.completionLenses,
      fieldMap: original.fieldMap,
      updatedAtIso: original.updatedAtIso,
    };

    expect(computeFingerprint(reordered)).toBe(computeFingerprint(original));
  });
});

describe("reviewStoredWorkspace", () => {
  it("accepts a configuration written by this version of the application", () => {
    const review = reviewStoredWorkspace(buildDefaultWorkspaceConfiguration());

    expect(review.status).toBe("current");
  });

  it("reports a configuration older than the rules that now read it", () => {
    const stale = { ...buildDefaultWorkspaceConfiguration(), schemaVersion: 0 };
    const review = reviewStoredWorkspace(stale);

    expect(review.status).toBe("needs-review");
    expect(review.status === "needs-review" && review.storedVersion).toBe(0);
  });

  it("never reinterprets an older configuration silently under the newer rules", () => {
    const stale = { ...buildDefaultWorkspaceConfiguration(), schemaVersion: 0 };
    const review = reviewStoredWorkspace(stale);

    expect(review.status === "needs-review" && review.reason).toMatch(/written by an earlier/i);
  });

  it("reports a configuration from a NEWER application version rather than downgrading it", () => {
    const future = {
      ...buildDefaultWorkspaceConfiguration(),
      schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION + 1,
    };

    expect(reviewStoredWorkspace(future).status).toBe("needs-review");
  });

  it("reports an unreadable document rather than silently starting from defaults", () => {
    expect(reviewStoredWorkspace(null).status).toBe("unreadable");
    expect(reviewStoredWorkspace({ nonsense: true }).status).toBe("unreadable");
  });
});

describe("what the fingerprint deliberately excludes", () => {
  it("does not move when the description template changes", () => {
    // The fingerprint exists so two people disputing a NUMBER can compare eight
    // characters. A section heading changes no number, so folding it in would
    // invalidate the comparison of unrelated figures every time somebody
    // reworded a piece of guidance — and worse, would make people leave a
    // heading wrong rather than risk it.
    const base = buildDefaultWorkspaceConfiguration();
    const reworded = {
      ...base,
      descriptionSections: [{ heading: "Something Else Entirely", guidance: "Anything." }],
    };

    expect(computeFingerprint(reworded)).toBe(computeFingerprint(base));
  });

  it("does not move when the template is emptied altogether", () => {
    const base = buildDefaultWorkspaceConfiguration();

    expect(computeFingerprint({ ...base, descriptionSections: [] })).toBe(
      computeFingerprint(base),
    );
  });

  it("still moves when something that DOES change a number changes", () => {
    // The counterpart assertion: excluding the template must not have made the
    // fingerprint insensitive to the things it exists for.
    const base = buildDefaultWorkspaceConfiguration();

    expect(computeFingerprint({ ...base, retrievalCeiling: base.retrievalCeiling + 1 })).not.toBe(
      computeFingerprint(base),
    );
  });
});
