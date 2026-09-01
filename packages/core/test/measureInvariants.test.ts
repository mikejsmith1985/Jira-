// measureInvariants.test.ts — The containment rules, swept across generated data.
//
// The single-case tests in measure.test.ts show each rule holds. This sweeps
// hundreds of generated shapes to show none of them slips through — because the
// invariant that matters is not "this example is fine" but "no example is not".
//
// Deterministic by construction: the generator is seeded, so a failure here is
// reproducible rather than a Heisenbug someone reruns until it passes.

import { describe, expect, it } from "vitest";

import { normaliseRawIssue } from "../src/model/detailedIssue.js";
import { buildIssueSet, buildRetrievalRecord } from "../src/model/issueSet.js";
import { measure } from "../src/measure/measure.js";

/** A seeded generator, so every run explores the same shapes. */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** An issue set holding `count` keys, optionally reporting more matched. */
function buildIssueSetOfSize(count: number, totalMatchingCount = count) {
  const keys = Array.from({ length: count }, (_unused, index) => `ENCUC-${index + 1}`);
  const record = buildRetrievalRecord({
    jql: "project = ENCUC",
    fieldsRequested: ["summary"],
    expandRequested: ["names"],
    startedAtIso: "2026-09-01T09:14:00.000Z",
    durationMs: 10,
    totalMatchingCount,
    fetchedCount: count,
    ceiling: 2_000,
    changelogCoverage: "none",
    workspaceFingerprint: "a3f91c2e",
    failure: null,
  });
  const issues = keys.map((key) =>
    normaliseRawIssue({ id: key, key, fields: { status: { statusCategory: { key: "new" } } } }, {}),
  );
  return { issueSet: buildIssueSet(record, issues), keys };
}

/** How many generated cases each sweep explores. */
const SWEEP_CASE_COUNT = 200;

describe("across generated populations", () => {
  it("never produces a measured result whose flagged keys escape its population", () => {
    const nextRandom = createSeededRandom(17);

    for (let caseIndex = 0; caseIndex < SWEEP_CASE_COUNT; caseIndex += 1) {
      const issueCount = 1 + Math.floor(nextRandom() * 40);
      const { issueSet, keys } = buildIssueSetOfSize(issueCount);
      const eligibleKeys = keys.filter(() => nextRandom() > 0.3);
      if (eligibleKeys.length === 0) continue;
      const flaggedKeys = eligibleKeys.filter(() => nextRandom() > 0.5);

      const result = measure({ sourceId: "sweep", flaggedKeys, eligibleKeys, issueSet });

      if (result.state !== "measured") continue;
      const eligibleSet = new Set(result.eligibleKeys);
      for (const flaggedKey of result.flaggedKeys) {
        expect(eligibleSet.has(flaggedKey)).toBe(true);
      }
    }
  });

  it("never produces a population containing a key that was not retrieved", () => {
    const nextRandom = createSeededRandom(29);

    for (let caseIndex = 0; caseIndex < SWEEP_CASE_COUNT; caseIndex += 1) {
      const issueCount = 1 + Math.floor(nextRandom() * 40);
      const { issueSet, keys } = buildIssueSetOfSize(issueCount);
      const eligibleKeys = keys.filter(() => nextRandom() > 0.4);
      if (eligibleKeys.length === 0) continue;

      const result = measure({ sourceId: "sweep", flaggedKeys: [], eligibleKeys, issueSet });

      if (result.state !== "measured") continue;
      for (const eligibleKey of result.eligibleKeys) {
        expect(issueSet.byKey.has(eligibleKey)).toBe(true);
      }
    }
  });

  it("never returns a measured result with an empty population", () => {
    const nextRandom = createSeededRandom(43);

    for (let caseIndex = 0; caseIndex < SWEEP_CASE_COUNT; caseIndex += 1) {
      const issueCount = Math.floor(nextRandom() * 20);
      const { issueSet, keys } = buildIssueSetOfSize(issueCount);
      // Deliberately biased towards empty populations, which is the case that
      // used to render as a perfect score.
      const eligibleKeys = nextRandom() > 0.7 ? keys : [];

      const result = measure({ sourceId: "sweep", flaggedKeys: [], eligibleKeys, issueSet });

      if (eligibleKeys.length === 0) {
        expect(result.state).toBe("not-applicable");
      }
    }
  });

  it("marks every measure over a truncated retrieval as a floor", () => {
    const nextRandom = createSeededRandom(61);

    for (let caseIndex = 0; caseIndex < SWEEP_CASE_COUNT; caseIndex += 1) {
      const issueCount = 1 + Math.floor(nextRandom() * 30);
      const extraMatches = Math.floor(nextRandom() * 500);
      const { issueSet, keys } = buildIssueSetOfSize(issueCount, issueCount + extraMatches);

      const result = measure({ sourceId: "sweep", flaggedKeys: [], eligibleKeys: keys, issueSet });

      if (result.state !== "measured") continue;
      expect(result.isPartial).toBe(extraMatches > 0);
    }
  });

  it("keeps the flagged count equal to the drill-through list, always", () => {
    const nextRandom = createSeededRandom(83);

    for (let caseIndex = 0; caseIndex < SWEEP_CASE_COUNT; caseIndex += 1) {
      const issueCount = 1 + Math.floor(nextRandom() * 25);
      const { issueSet, keys } = buildIssueSetOfSize(issueCount);
      const flaggedKeys = keys.filter(() => nextRandom() > 0.6);

      const result = measure({
        sourceId: "sweep",
        flaggedKeys,
        eligibleKeys: keys,
        issueSet,
      });

      if (result.state !== "measured") continue;
      // There is no separate count to compare against — which is the point. The
      // number a tile shows IS this length, so they cannot diverge.
      expect(result.flaggedKeys.length).toBe(flaggedKeys.length);
    }
  });
});
