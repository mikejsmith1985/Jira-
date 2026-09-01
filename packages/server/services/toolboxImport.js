// toolboxImport.js — Take the field mapping he already did, don't ask for it again.
//
// Mapping custom fields by hand is the one genuinely tedious step in setting
// this up, and it was already done once in NodeToolbox. Asking for it a second
// time is the friction that stopped the predecessor being adopted, so this
// OVERWRITES the Jira+ field map from Toolbox's own configuration without a
// confirmation gate in front of it.
//
// That is a deliberate exception, not a lapse. The defect this product exists to
// remove is a HARDCODED default silently binding a check to the wrong field. A
// value the user configured himself is evidence of what his instance actually
// uses; the two are not the same risk, and treating them the same just makes him
// re-answer his own question.
//
// It runs where Jira+ runs, reading that machine's Toolbox file, because his
// real configuration lives on his work machine and nowhere else.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where NodeToolbox keeps its configuration, beside its own journal. */
const TOOLBOX_CONFIG_PATH = path.join(
  process.env.APPDATA || os.homedir(),
  'NodeToolbox',
  'toolbox-proxy.json',
);

/**
 * Which Toolbox list supplies each Jira+ concept.
 *
 * Toolbox stored several ids per concept because its checks accepted any of
 * them. Jira+ maps one field per concept, so the first configured id wins.
 */
const CONCEPT_SOURCES = {
  storyPoints: 'storyPointsFieldIds',
  acceptanceCriteria: 'acceptanceCriteriaFieldIds',
  parentFeature: 'featureLinkFieldIds',
  targetStart: 'targetStartFieldIds',
  targetEnd: 'targetEndFieldIds',
  programIncrement: 'programIncrementFieldIds',
};

/** Concepts Jira+ knows. Anything else in Toolbox is not ours to import. */
const IMPORTABLE_CONCEPT_IDS = Object.keys(CONCEPT_SOURCES);

/** Reads the Toolbox configuration, or null when this machine has none. */
function readToolboxConfig() {
  try {
    return JSON.parse(fs.readFileSync(TOOLBOX_CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** The first usable id in a list, or undefined when the list holds none. */
function readFirstFieldId(candidateIds) {
  if (!Array.isArray(candidateIds)) return undefined;
  return candidateIds.find((id) => typeof id === 'string' && id.trim().length > 0);
}

/**
 * Extracts one field id per concept from a Toolbox configuration.
 *
 * Teams are merged rather than picked between: one team having mapped a field is
 * enough, and a concept no team mapped stays absent rather than acquiring a
 * default. Inventing a value here would recreate the exact defect this product
 * exists to remove.
 */
function readToolboxFieldConfig(toolboxConfig) {
  const found = {};
  const teams = toolboxConfig?.hygieneMonitor?.teams ?? [];

  for (const team of teams) {
    const fieldConfig = team?.fieldConfig ?? {};
    for (const conceptId of IMPORTABLE_CONCEPT_IDS) {
      if (found[conceptId] !== undefined) continue;
      const fieldId = readFirstFieldId(fieldConfig[CONCEPT_SOURCES[conceptId]]);
      if (fieldId !== undefined) found[conceptId] = fieldId;
    }
  }

  // The scheduler kept a feature-link id of its own, which is the only place
  // some installations ever set one.
  if (found.parentFeature === undefined) {
    const schedulerFieldId = toolboxConfig?.scheduler?.monthlyDelivery?.featureLinkFieldId;
    if (typeof schedulerFieldId === 'string' && schedulerFieldId.trim().length > 0) {
      found.parentFeature = schedulerFieldId;
    }
  }

  return found;
}

/**
 * Applies the imported ids over an existing field map.
 *
 * A concept Toolbox knew nothing about is left exactly as it was — the import
 * replaces what it has evidence for and touches nothing else.
 *
 * @returns the new map and a list of what changed, so the result can be checked.
 */
function buildFieldMapFromToolbox(existingFieldMap, importedFieldIds) {
  const fieldMap = { ...existingFieldMap };
  const changes = [];
  const confirmedAt = new Date().toISOString();

  for (const [conceptId, fieldId] of Object.entries(importedFieldIds)) {
    if (!IMPORTABLE_CONCEPT_IDS.includes(conceptId)) continue;

    const previous = existingFieldMap[conceptId];
    const previousFieldId = previous?.fieldId ?? null;
    if (previousFieldId === fieldId) continue;

    fieldMap[conceptId] = {
      state: 'resolved',
      fieldId,
      // Named for where it came from, so a mapping can be traced back to the
      // import months later rather than looking like somebody confirmed it.
      jiraName: 'Imported from NodeToolbox',
      confirmedAt,
    };
    changes.push({ conceptId, previousFieldId, fieldId });
  }

  return { fieldMap, changes };
}

/** Is there a Toolbox configuration on this machine to import from? */
function isToolboxPresent() {
  return fs.existsSync(TOOLBOX_CONFIG_PATH);
}

export {
  CONCEPT_SOURCES,
  IMPORTABLE_CONCEPT_IDS,
  TOOLBOX_CONFIG_PATH,
  buildFieldMapFromToolbox,
  isToolboxPresent,
  readToolboxConfig,
  readToolboxFieldConfig,
};
