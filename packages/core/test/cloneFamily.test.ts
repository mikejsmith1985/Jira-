// cloneFamily.test.ts — Four projects, no admin rights, one readable lane.
//
// The decisive rule, and the one a reasonable person gets wrong: THE PROJECT
// DECIDES, NOT THE LINK. A Cloners link can equally point at a peer Feature
// inside the dev team's own project. Treating every clone link as another
// discipline's copy would turn a colleague's Feature into a QE sub-lane, which
// is both wrong and confusing.
//
// The other rule that matters: the two progress figures are never blended. A
// single number would leave a reader unable to say whether dev is finished and
// QE has not started, or the reverse — opposite situations calling for opposite
// conversations.

import { describe, expect, it } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import {
  buildDisciplineWorkJql,
  discoverCloneFamily,
} from "../src/family/cloneFamily.js";
import type { DisciplineProject } from "../src/family/cloneFamily.js";
import {
  buildDisciplineRow,
  buildFamilyProgress,
  describeFamilyProgress,
  toCoarseState,
} from "../src/family/familyProgress.js";

/** The disciplines, exactly as the topology describes them. */
const DISCIPLINES: readonly DisciplineProject[] = [
  {
    disciplineId: "qe",
    label: "QE",
    featureProjectKeys: ["QEFEAT"],
    storyProjectKeys: ["QEINT"],
  },
  {
    disciplineId: "bt",
    label: "BT",
    featureProjectKeys: ["BTFEAT"],
    storyProjectKeys: ["BTINT"],
  },
];

/** The dev team's own projects: Features in DENP, work in ENCUC. */
const DEV_PROJECT_KEYS: readonly string[] = ["DENP", "ENCUC"];

/** One issue, optionally carrying clone links. */
function buildIssue(
  key: string,
  options: { cloneKeys?: readonly string[]; statusCategory?: string; summary?: string } = {},
) {
  const fields: Record<string, unknown> = {
    summary: options.summary ?? `Work on ${key}`,
    issuetype: { name: "Feature" },
    status: { id: "3", name: "In Progress", statusCategory: { key: options.statusCategory ?? "indeterminate" } },
  };

  if (options.cloneKeys !== undefined) {
    fields.issuelinks = options.cloneKeys.map((cloneKey) => ({
      type: { name: "Cloners" },
      outwardIssue: { key: cloneKey },
    }));
  }

  return normaliseRawIssue({ id: key, key, fields }, {});
}

/** An issue set holding the given issues. */
function buildSet(issues: readonly ReturnType<typeof buildIssue>[]) {
  const record = buildRetrievalRecord({
    jql: "project = DENP",
    fieldsRequested: ["summary", "issuelinks"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount: issues.length,
    fetchedCount: issues.length,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  return buildIssueSet(record, issues);
}

describe("the project decides, not the link", () => {
  it("treats a clone in a discipline project as that discipline's copy", () => {
    const feature = buildIssue("DENP-1359", { cloneKeys: ["QEFEAT-610"] });

    const family = discoverCloneFamily({
      devFeatures: [feature],
      devProjectKeys: DEV_PROJECT_KEYS,
      disciplines: DISCIPLINES,
    });

    expect(family.matches).toEqual([
      {
        devFeatureKey: "DENP-1359",
        cloneKey: "QEFEAT-610",
        disciplineId: "qe",
        matchedBy: "cloners-link",
        isReadable: true,
      },
    ]);
  });

  it("treats a clone inside a dev project as a PEER, not a sub-lane", () => {
    // The sampled Feature is cloned by both a peer in the dev team's own project
    // and by QE's copy. Only the second is another discipline's work.
    const feature = buildIssue("DENP-1359", { cloneKeys: ["DENP-1400", "QEFEAT-610"] });

    const family = discoverCloneFamily({
      devFeatures: [feature],
      devProjectKeys: DEV_PROJECT_KEYS,
      disciplines: DISCIPLINES,
    });

    expect(family.peerCloneKeys).toEqual(["DENP-1400"]);
    expect(family.matches.map((match) => match.cloneKey)).toEqual(["QEFEAT-610"]);
  });

  it("reports a clone in a project nobody claimed rather than guessing its owner", () => {
    const feature = buildIssue("DENP-1359", { cloneKeys: ["MYSTERY-42"] });

    const family = discoverCloneFamily({
      devFeatures: [feature],
      devProjectKeys: DEV_PROJECT_KEYS,
      disciplines: DISCIPLINES,
    });

    expect(family.unclaimedCloneKeys).toEqual(["MYSTERY-42"]);
    expect(family.matches).toHaveLength(0);
  });

  it("finds both disciplines when a Feature is cloned twice", () => {
    const feature = buildIssue("DENP-1359", { cloneKeys: ["QEFEAT-610", "BTFEAT-77"] });

    const family = discoverCloneFamily({
      devFeatures: [feature],
      devProjectKeys: DEV_PROJECT_KEYS,
      disciplines: DISCIPLINES,
    });

    expect(family.matches.map((match) => match.disciplineId).sort()).toEqual(["bt", "qe"]);
  });

  it("costs nothing extra, because clone links already arrive with the Feature", () => {
    const feature = buildIssue("DENP-1359", { cloneKeys: ["QEFEAT-610"] });

    // No adapter, no request: discovery reads what was already fetched.
    const family = discoverCloneFamily({
      devFeatures: [feature],
      devProjectKeys: DEV_PROJECT_KEYS,
      disciplines: DISCIPLINES,
    });

    expect(family.matches).toHaveLength(1);
  });

  it("finds nothing when a Feature has no clone links", () => {
    const family = discoverCloneFamily({
      devFeatures: [buildIssue("DENP-1359")],
      devProjectKeys: DEV_PROJECT_KEYS,
      disciplines: DISCIPLINES,
    });

    expect(family.matches).toHaveLength(0);
  });
});

describe("the query that finds a discipline's work", () => {
  it("scopes to that discipline's own story projects", () => {
    const jql = buildDisciplineWorkJql(DISCIPLINES[0]!, ["QEFEAT-610"]);

    expect(jql).toContain('project in ("QEINT")');
    expect(jql).toContain('parent in ("QEFEAT-610")');
  });

  it("mentions no sprint, because the view is Feature-scoped", () => {
    const jql = buildDisciplineWorkJql(DISCIPLINES[0]!, ["QEFEAT-610"]) ?? "";

    // QE's sprint boundaries have no bearing on whether their work supporting a
    // Feature is done, which is why mixing projects in a sprint board never
    // arises here.
    expect(jql.toLowerCase()).not.toContain("sprint");
  });

  it("returns null with no clones, rather than a query matching everything", () => {
    expect(buildDisciplineWorkJql(DISCIPLINES[0]!, [])).toBeNull();
  });
});

describe("two figures, never blended", () => {
  const devIssues = [
    buildIssue("ENCUC-1", { statusCategory: "done" }),
    buildIssue("ENCUC-2", { statusCategory: "done" }),
  ];
  const qeIssues = [
    buildIssue("QEINT-1", { statusCategory: "done" }),
    buildIssue("QEINT-2", { statusCategory: "indeterminate" }),
    buildIssue("QEINT-3", { statusCategory: "new" }),
  ];

  it("reports dev-only and whole-family as separate Measures", () => {
    const issueSet = buildSet([...devIssues, ...qeIssues]);
    const qeRow = buildDisciplineRow({
      disciplineId: "qe",
      label: "QE",
      cloneKeys: ["QEFEAT-610"],
      issues: qeIssues,
      view: { mode: "coarse-three-state", reason: "no readable board" },
      issueSet,
    });

    const progress = buildFamilyProgress({
      devIssues,
      disciplineRows: [qeRow],
      unreadableCloneKeys: [],
      issueSet,
      featureKey: "DENP-1359",
    });

    expect(progress.devOnly.state === "measured" && progress.devOnly.eligibleKeys).toHaveLength(2);
    expect(
      progress.wholeFamily.state === "measured" && progress.wholeFamily.eligibleKeys,
    ).toHaveLength(5);
  });

  it("shows dev finished while the family is not, which one number could not", () => {
    const issueSet = buildSet([...devIssues, ...qeIssues]);
    const qeRow = buildDisciplineRow({
      disciplineId: "qe",
      label: "QE",
      cloneKeys: ["QEFEAT-610"],
      issues: qeIssues,
      view: { mode: "coarse-three-state", reason: "no readable board" },
      issueSet,
    });

    const description = describeFamilyProgress(
      buildFamilyProgress({
        devIssues,
        disciplineRows: [qeRow],
        unreadableCloneKeys: [],
        issueSet,
        featureKey: "DENP-1359",
      }),
    );

    expect(description).toBe("Dev 2/2 · Family 3/5");
  });

  it("marks the family figure as a floor when a clone could not be read", () => {
    const issueSet = buildSet(devIssues);

    const description = describeFamilyProgress(
      buildFamilyProgress({
        devIssues,
        disciplineRows: [],
        unreadableCloneKeys: ["BTFEAT-77"],
        issueSet,
        featureKey: "DENP-1359",
      }),
    );

    expect(description).toMatch(/at least/i);
    expect(description).toMatch(/could not be read/i);
  });
});

describe("a discipline's work is described in its own terms", () => {
  it("is always read-only, because their columns are not ours to write to", () => {
    const issueSet = buildSet([buildIssue("QEINT-1")]);

    const row = buildDisciplineRow({
      disciplineId: "qe",
      label: "QE",
      cloneKeys: ["QEFEAT-610"],
      issues: [buildIssue("QEINT-1")],
      view: { mode: "own-columns", columnNames: ["To Test", "Testing", "Passed"], boardName: "QE Board" },
      issueSet,
    });

    expect(row.isReadOnly).toBe(true);
  });

  it("falls back to Jira's own three states, and says why", () => {
    const issueSet = buildSet([buildIssue("QEINT-1")]);

    const row = buildDisciplineRow({
      disciplineId: "qe",
      label: "QE",
      cloneKeys: ["QEFEAT-610"],
      issues: [buildIssue("QEINT-1")],
      view: { mode: "coarse-three-state", reason: "QE's board is not readable from this account." },
      issueSet,
    });

    // Forcing QE's work into the dev team's columns would be the same class of
    // lie as the parallel vocabulary this design removed.
    expect(row.view.mode).toBe("coarse-three-state");
    expect(row.view.mode === "coarse-three-state" && row.view.reason).toMatch(/not readable/i);
  });

  it("maps Jira's categories onto the coarse states", () => {
    expect(toCoarseState(buildIssue("A", { statusCategory: "new" }))).toBe("not started");
    expect(toCoarseState(buildIssue("B", { statusCategory: "indeterminate" }))).toBe("in progress");
    expect(toCoarseState(buildIssue("C", { statusCategory: "done" }))).toBe("done");
  });
});
