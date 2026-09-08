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

export type {
  CapabilityProbe,
  FieldSelection,
  JiraAdapter,
  JiraFieldDescriptor,
  JiraResponse,
  JiraSearchPage,
  JiraTransport,
  JqlSearchRequest,
  TransitionDescriptor,
} from "./jira/jiraAdapter.js";
export { createDataCenterAdapter } from "./jira/dataCenterAdapter.js";
export { createCloudAdapter } from "./jira/cloudAdapter.js";
export { fetchIssueSet } from "./jira/fetchIssueSet.js";
export type { FetchIssueSetInput } from "./jira/fetchIssueSet.js";
export { fetchIssuesPaged } from "./jira/fetchIssuesPaged.js";
export type { FetchedPage, PagedResult, PageFetcher, PagingOptions } from "./jira/fetchIssuesPaged.js";
export { buildIssueKeyClause, combineJql, escapeJqlValue } from "./jira/jqlValue.js";

export type {
  CompletionLens,
  CompletionLensId,
  FieldMatchMethod,
  StatusCondition,
  WorkingCalendar,
  WorkspaceReview,
} from "./workspace/workspaceConfig.js";
export { ASSISTANT_INPUT_LIMIT_CHARACTERS } from "./workspace/defaults.js";

export type {
  ChunkState,
  ChunkOptions,
  PromptChunk,
  PromptChunkSet,
} from "./packs/buildPromptChunks.js";
export { buildPromptChunks } from "./packs/buildPromptChunks.js";
export type {
  PackContext,
  PackFieldSpec,
  PackItemSchema,
  PromptPack,
  ValidatedFieldValue,
  ValidatedItem,
} from "./packs/promptPack.js";
export { SHARED_PROMPT_RULES, renderItemSchema } from "./packs/promptPack.js";
export type { PackReplyResult, ReplyRejection } from "./packs/parsePackReply.js";
export { parsePackReply } from "./packs/parsePackReply.js";
export { extractJsonPayload, NoJsonFoundError } from "./packs/extractJsonPayload.js";
export { ALL_PROMPT_PACKS, findPromptPack } from "./packs/packRegistry.js";
export { ASK_ANYTHING_PACK } from "./packs/definitions/askAnything.js";

export type { IssueTimeline, Segment } from "./flow/issueTimeline.js";
export {
  UNASSIGNED_HOLDER,
  buildIssueTimeline,
  buildStateSegments,
  findFirstEntryMs,
  findLastEntryMs,
  summariseTimeInStatus,
} from "./flow/issueTimeline.js";
export {
  businessDaysBetween,
  businessMillisBetween,
  isWorkingDay,
  nextWorkingDay,
  parseIsoOrNull,
  toIsoDate,
  toIsoWeek,
} from "./flow/workingDays.js";
export type { ResolvedLens } from "./flow/completionLens.js";
export {
  buildVerifyingJql,
  describeLens,
  findCompletionMs,
  findLensContradictions,
  findStartMs,
  isLensDefined,
  resolveConditionStatuses,
  resolveLens,
} from "./flow/completionLens.js";
export type { HolderCredit, HolderTotal } from "./flow/attribution.js";
export {
  allocateHolderCredit,
  assertSharesSumToOne,
  summariseHolderTotals,
} from "./flow/attribution.js";
export type {
  AgingItem,
  AgingResult,
  CycleTimePoint,
  CycleTimeResult,
  FlowFact,
  FlowFactSet,
  ThroughputResult,
  ThroughputWeek,
} from "./flow/flowMeasures.js";
export {
  REPORTED_PERCENTILES,
  buildFlowFacts,
  computeAgingWork,
  computeCycleTime,
  computeHolderTotals,
  computeThroughput,
} from "./flow/flowMeasures.js";
export type { DeliveryEvidenceDocument, EvidenceIssueLine } from "./flow/deliveryEvidence.js";
export {
  buildDeliveryEvidence,
  renderDeliveryEvidenceMarkdown,
} from "./flow/deliveryEvidence.js";

export type { CheckContext, CheckDefinition, CheckSeverity } from "./checks/defineCheck.js";
export {
  DELIVERY_ISSUE_TYPE_NAMES,
  defineCheck,
  hasMeaningfulValue,
  isDeliveryIssueType,
} from "./checks/defineCheck.js";
export { ALL_CHECKS, ALL_CHECK_IDS, findCheck } from "./checks/registry.js";
export type { CheckResult, CheckSummary } from "./checks/runChecks.js";
export { buildCheckContext, runCheck, runChecks, summariseChecks } from "./checks/runChecks.js";
export type {
  ConceptProposal,
  FieldCandidate,
  FieldMapResolution,
} from "./fields/resolveFieldMap.js";
export {
  clearFieldChoice,
  confirmConceptAbsent,
  confirmFieldChoice,
  listAbsentConcepts,
  listUnresolvedConcepts,
  readConceptValue,
  resolveFieldMap,
} from "./fields/resolveFieldMap.js";

export { buildJiraBrowseUrl, buildJiraSearchUrl } from "./jira/jiraUrls.js";

export type {
  ChangeBlocker,
  ChangeSet,
  PlannedChange,
  Proposal,
  WriteRoute,
} from "./apply/buildChangeSet.js";
export { buildChangeSet, canApplyChangeSet } from "./apply/buildChangeSet.js";
export type { ApplyOutcome, ApplyResult } from "./apply/runApplyPlan.js";
export { runApplyPlan } from "./apply/runApplyPlan.js";
export type { FieldWriteRequest, FieldWriter } from "./jira/write/fieldWriters.js";
export { inferWriteRoute, resolveFieldWriteRoute } from "./jira/write/fieldWriters.js";
export type { DeterministicFix } from "./apply/fixes/deterministicFixes.js";
export {
  ALL_DETERMINISTIC_FIXES,
  SET_MISSING_FIX_VERSION,
  findDeterministicFix,
  findFixForCheck,
} from "./apply/fixes/deterministicFixes.js";

export { DELIVERY_NARRATIVE_PACK } from "./packs/definitions/deliveryNarrative.js";
export { FIX_ACCEPTANCE_CRITERIA_PACK } from "./packs/definitions/fixAcceptanceCriteria.js";

export type {
  BoardSpine,
  BoardSpineFailure,
  BoardSpineResult,
  SpineColumn,
} from "./board/boardSpine.js";
export {
  UNMAPPED_COLUMN_ID,
  UNMAPPED_COLUMN_NAME,
  fetchBoardSpine,
  findDuplicateColumnNames,
  resolveColumnForStatus,
} from "./board/boardSpine.js";
export type {
  BandedColumn,
  BandedGroup,
  CardMarker,
  ColumnRefinement,
  RefinementBand,
  RefinementValidation,
} from "./board/columnRefinement.js";
export {
  UNCLASSIFIED_BAND_ID,
  assertBandsHoldEveryCard,
  assignCardsToBands,
  hasCardMarker,
  validateRefinements,
} from "./board/columnRefinement.js";
export type { BoardLane, BoardLayout } from "./board/boardLayout.js";
export {
  NO_FEATURE_LANE_ID,
  NO_FEATURE_LANE_NAME,
  assertEveryIssueAppearsOnce,
  buildBoardLayout,
} from "./board/boardLayout.js";
export type { MoveOutcome, MovePlan, MoveTarget } from "./board/planStatusMove.js";
export { executeStatusMove, planStatusMove } from "./board/planStatusMove.js";
export type { BoardSummary } from "./jira/jiraAdapter.js";

export type {
  CloneFamilyMap,
  CloneMatch,
  CloneMatchMethod,
  DisciplineProject,
} from "./family/cloneFamily.js";
export { buildDisciplineWorkJql, discoverCloneFamily } from "./family/cloneFamily.js";
export type { DisciplineRow, DisciplineView, FamilyProgress } from "./family/familyProgress.js";
export {
  buildDisciplineRow,
  buildFamilyProgress,
  describeFamilyProgress,
  toCoarseState,
} from "./family/familyProgress.js";

// ── Authoring ────────────────────────────────────────────────────────────────
// Writing an issue rather than measuring one. The single field that decides
// create versus update lives in draft.ts, and nothing else decides it.
export {
  addSource,
  buildEmptyDraft,
  isEnrichingExistingIssue,
  readDraftFieldValues,
  removeSource,
} from "./authoring/draft.js";
export type { AuthoringDraft, AuthoringSource } from "./authoring/draft.js";
export {
  buildCreateScreenShape,
  describeUnavailableShape,
  findField,
  isAllowedValue,
  readRequiredFields,
} from "./authoring/createScreenShape.js";
export type {
  CreateScreenField,
  CreateScreenShape,
  IssueTypeChoice,
} from "./authoring/createScreenShape.js";
export {
  SEED_DESCRIPTION_SECTIONS,
  hasImposedStructure,
  readSectionTemplate,
} from "./authoring/sectionTemplate.js";
export type { DescriptionSection } from "./authoring/sectionTemplate.js";
export { assessDraftReadiness } from "./authoring/assessDraftReadiness.js";
export type {
  ReadinessAssessment,
  ReadinessFinding,
  UnassessedCheck,
} from "./authoring/assessDraftReadiness.js";
export { DRAFT_ISSUE_KEY, projectDraftAsIssue } from "./authoring/projectDraftAsIssue.js";
export {
  AUTHORING_PACK_ID,
  SOURCE_EXCERPT_LIMIT,
  buildAuthoringPromptHead,
  chunkAuthoringPrompt,
  parseAuthoringReply,
} from "./authoring/authoringPack.js";
export type { AuthoringPromptPart, AuthoringProposal } from "./authoring/authoringPack.js";
export {
  VALIDATION_MARKER,
  findUnvalidatedSections,
  normaliseDescription,
  stripAttribution,
} from "./authoring/normaliseDescription.js";
export {
  describeLoadFailure,
  loadIssueIntoDraft,
  readLoadResult,
} from "./authoring/loadIssueIntoDraft.js";
export type {
  LoadFailure,
  LoadResult,
  LoadedIssue,
} from "./authoring/loadIssueIntoDraft.js";
export {
  NEW_ISSUE_KEY,
  buildAuthoringChangeSet,
  isCreatingNewIssue,
} from "./authoring/buildAuthoringChangeSet.js";
