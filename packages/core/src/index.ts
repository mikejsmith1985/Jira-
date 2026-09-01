// index.ts — The public surface of the engine.
//
// Everything both the server and the browser consume is re-exported here, so
// there is exactly one entry point and no caller reaches into a private path.
// This file is what makes "one engine, compiled for both runtimes" a fact rather
// than an intention: the Express host and the React client import the same
// build of the same rules, so they cannot disagree the way the predecessor's
// hand-written server port did.

export type {
  ChangelogEntry,
  ChangelogItem,
  DetailedIssue,
  StatusCategoryKey,
} from "./model/detailedIssue.js";
export { hasRetrievedChangelog, normaliseRawIssue } from "./model/detailedIssue.js";

export type {
  ChangelogCoverage,
  IssueSet,
  IssueSetState,
  RetrievalFailure,
  RetrievalRecord,
  RetrievalRecordInput,
} from "./model/issueSet.js";
export { buildIssueSet, buildRetrievalRecord } from "./model/issueSet.js";

export type {
  EvaluabilityBlocker,
  JiraFieldSummary,
  Measure,
  MeasureInput,
  MeasureProvenance,
} from "./measure/measure.js";
export { canContributeToAggregate, measure, readFlaggedCount } from "./measure/measure.js";

export type { ConceptId } from "./fields/conceptId.js";
export { ALL_CONCEPT_IDS, CONCEPT_DESCRIPTIONS } from "./fields/conceptId.js";

export type {
  FieldMap,
  FieldMapEntry,
  WorkspaceConfiguration,
} from "./workspace/workspaceConfig.js";
export {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  buildDefaultWorkspaceConfiguration,
  computeFingerprint,
  reviewStoredWorkspace,
} from "./workspace/workspaceConfig.js";

export {
  DEFAULT_PAGE_SIZE,
  DEFAULT_RETRIEVAL_CEILING,
  DEFAULT_TRANSFER_BUDGET_CHARACTERS,
} from "./workspace/defaults.js";
