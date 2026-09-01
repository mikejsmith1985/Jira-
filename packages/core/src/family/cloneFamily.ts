// cloneFamily.ts — Work that spans four projects and nobody's admin rights.
//
// The real topology: Features live in one project, the team's own work in
// another. QE clones the Feature into QE's feature project and links its stories
// from QE's team project. BT does the same with two more. QE and BT run their
// own Scrum sprints, and there are no admin rights in any of those projects.
//
// No Jira board can show this. A shared board would need administration nobody
// has, reconfiguration nobody agreed to, and projects mixed into one sprint
// board — which the author accurately describes as getting hairy fast.
//
// Jira+ is not a board. It is a view assembled from queries, and read-only
// cross-project JQL needs only Browse permission. That constraint is what makes
// this possible, not what prevents it.
//
// THE PROJECT DECIDES, NOT THE LINK. A clone link pointing inside the dev team's
// own project is a peer Feature and keeps its own top-level lane. Only a clone
// in a project declared as another discipline becomes a sub-lane.

import type { DetailedIssue } from "../model/detailedIssue.js";

/** One discipline and the projects it works in. */
export interface DisciplineProject {
  readonly disciplineId: string;
  readonly label: string;
  /** Where this discipline keeps its copies of the Feature. */
  readonly featureProjectKeys: readonly string[];
  /** Where this discipline keeps the work beneath those copies. */
  readonly storyProjectKeys: readonly string[];
}

/** How a clone was identified. */
export type CloneMatchMethod = "cloners-link" | "name-match";

/** One discipline's copy of a dev Feature. */
export interface CloneMatch {
  readonly devFeatureKey: string;
  readonly cloneKey: string;
  readonly disciplineId: string;
  readonly matchedBy: CloneMatchMethod;
  /** False when the clone is known to exist but could not be read. */
  readonly isReadable: boolean;
}

/** What discovery found, and what it could not resolve. */
export interface CloneFamilyMap {
  readonly matches: readonly CloneMatch[];
  /** Clone links pointing at projects no discipline claims. Reported, never guessed at. */
  readonly unclaimedCloneKeys: readonly string[];
  /** Clones inside a dev project: peers, not sub-lanes. */
  readonly peerCloneKeys: readonly string[];
}

/** Link type names Jira uses for a clone relationship. */
const CLONE_LINK_TYPE_NAMES: readonly string[] = ["cloners", "clones", "cloned"];

/** The project key part of an issue key. */
function readProjectKey(issueKey: string): string {
  const separator = issueKey.lastIndexOf("-");
  return separator === -1 ? issueKey : issueKey.slice(0, separator);
}

/** Every issue key this issue is linked to as a clone. */
function readCloneLinkKeys(issue: DetailedIssue): readonly string[] {
  const rawLinks = issue.fields.get("issuelinks");
  if (!Array.isArray(rawLinks)) return [];

  const keys: string[] = [];

  for (const rawLink of rawLinks) {
    if (rawLink === null || typeof rawLink !== "object") continue;
    const link = rawLink as Record<string, unknown>;

    const typeName = String(
      (link.type as Record<string, unknown> | undefined)?.name ?? "",
    ).toLowerCase();
    if (!CLONE_LINK_TYPE_NAMES.some((candidate) => typeName.includes(candidate))) continue;

    for (const side of ["inwardIssue", "outwardIssue"] as const) {
      const linked = link[side];
      if (linked === null || typeof linked !== "object") continue;
      const key = (linked as Record<string, unknown>).key;
      if (typeof key === "string") keys.push(key);
    }
  }

  return keys;
}

/** Which discipline claims a project, or null when none does. */
function findDisciplineForProject(
  projectKey: string,
  disciplines: readonly DisciplineProject[],
): DisciplineProject | null {
  return (
    disciplines.find((discipline) =>
      discipline.featureProjectKeys.some((candidate) => candidate === projectKey),
    ) ?? null
  );
}

/**
 * Finds each discipline's copy of each dev Feature.
 *
 * Discovery costs nothing extra: clone links already arrive in `issuelinks` on
 * the Features that were fetched.
 *
 * The project decides. A Cloners link can equally point at a peer Feature inside
 * the dev team's own project — that is a normal top-level lane, not somebody
 * else's discipline — and only a clone in a project declared as a discipline
 * becomes a sub-lane. A clone in a project nobody claimed is REPORTED rather
 * than guessed at, because guessing which team owns a project is exactly the
 * kind of confident wrongness this product exists to remove.
 */
export function discoverCloneFamily(input: {
  readonly devFeatures: readonly DetailedIssue[];
  readonly devProjectKeys: readonly string[];
  readonly disciplines: readonly DisciplineProject[];
}): CloneFamilyMap {
  const matches: CloneMatch[] = [];
  const unclaimedCloneKeys: string[] = [];
  const peerCloneKeys: string[] = [];

  for (const feature of input.devFeatures) {
    for (const cloneKey of readCloneLinkKeys(feature)) {
      const projectKey = readProjectKey(cloneKey);

      // A clone inside a dev project is a peer Feature. It keeps its own
      // top-level lane; it is not another discipline's copy.
      if (input.devProjectKeys.includes(projectKey)) {
        peerCloneKeys.push(cloneKey);
        continue;
      }

      const discipline = findDisciplineForProject(projectKey, input.disciplines);
      if (discipline === null) {
        unclaimedCloneKeys.push(cloneKey);
        continue;
      }

      matches.push({
        devFeatureKey: feature.key,
        cloneKey,
        disciplineId: discipline.disciplineId,
        matchedBy: "cloners-link",
        isReadable: true,
      });
    }
  }

  return { matches, unclaimedCloneKeys, peerCloneKeys };
}

/**
 * The JQL that finds a discipline's work beneath its clones.
 *
 * Read-only and cross-project, which needs only Browse permission — no admin
 * anywhere, no board to create, nothing for QE or BT to agree to.
 */
export function buildDisciplineWorkJql(
  discipline: DisciplineProject,
  cloneKeys: readonly string[],
): string | null {
  if (cloneKeys.length === 0) return null;

  const quotedKeys = cloneKeys.map((key) => `"${key}"`).join(", ");
  const projectClause =
    discipline.storyProjectKeys.length > 0
      ? `project in (${discipline.storyProjectKeys.map((key) => `"${key}"`).join(", ")}) AND `
      : "";

  // Sprints are deliberately absent from this query. The view is Feature-scoped,
  // so QE's and BT's own sprint boundaries have no bearing on whether their work
  // supporting a Feature is done — which is why the "mixing projects in a sprint
  // board" problem never arises here.
  return `${projectClause}parent in (${quotedKeys})`;
}
