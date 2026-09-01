// toolboxImport.test.js — Taking the mapping he already did, rather than asking again.
//
// Mike mapped every custom field in NodeToolbox once. Making him do it a second
// time is precisely the friction that stopped the predecessor being adopted, so
// this import OVERWRITES the Jira+ field map from Toolbox's own configuration
// and does not ask permission first. He configured those values; they are
// evidence, not a guess.
//
// Two things it must get right. Toolbox stores per-concept field ids as ARRAYS,
// sometimes several, because its checks accepted any of them - Jira+ maps one
// field per concept, so the first configured id wins and the rest are reported
// rather than silently dropped. And Toolbox's own configured values outrank its
// hardcoded fallbacks, because the hardcoded story-points id was WRONG for this
// instance and reported clean zeros for months.

import { describe, expect, it } from 'vitest';

import { buildFieldMapFromToolbox, readToolboxFieldConfig } from '../services/toolboxImport.js';

/** A Toolbox configuration with one team's fields filled in. */
function buildToolboxConfig(fieldConfig, extra = {}) {
  return {
    hygieneMonitor: { teams: [{ teamName: 'ENCUC', fieldConfig }] },
    scheduler: {},
    ...extra,
  };
}

describe('reading Toolbox configuration', () => {
  it('takes the field ids a team was actually configured with', () => {
    const config = buildToolboxConfig({
      storyPointsFieldIds: ['customfield_10236'],
      acceptanceCriteriaFieldIds: ['customfield_10500'],
    });

    const found = readToolboxFieldConfig(config);

    expect(found.storyPoints).toBe('customfield_10236');
    expect(found.acceptanceCriteria).toBe('customfield_10500');
  });

  it('takes the first id when a concept was configured with several', () => {
    // Toolbox accepted any of a list; Jira+ maps one field per concept, so the
    // first wins - and the fact that others existed is worth reporting, not
    // worth silently discarding.
    const config = buildToolboxConfig({
      acceptanceCriteriaFieldIds: ['customfield_10500', 'customfield_10501'],
    });

    expect(readToolboxFieldConfig(config).acceptanceCriteria).toBe('customfield_10500');
  });

  it('merges across teams, so one team having mapped a field is enough', () => {
    const config = {
      hygieneMonitor: {
        teams: [
          { teamName: 'A', fieldConfig: { storyPointsFieldIds: ['customfield_10236'] } },
          { teamName: 'B', fieldConfig: { targetStartFieldIds: ['customfield_10101'] } },
        ],
      },
      scheduler: {},
    };

    const found = readToolboxFieldConfig(config);

    expect(found.storyPoints).toBe('customfield_10236');
    expect(found.targetStart).toBe('customfield_10101');
  });

  it('falls back to the scheduler feature-link field when no team mapped one', () => {
    const config = buildToolboxConfig(
      {},
      { scheduler: { monthlyDelivery: { featureLinkFieldId: 'customfield_10108' } } },
    );

    expect(readToolboxFieldConfig(config).parentFeature).toBe('customfield_10108');
  });

  it('prefers a team mapping over the scheduler fallback', () => {
    const config = buildToolboxConfig(
      { featureLinkFieldIds: ['customfield_10999'] },
      { scheduler: { monthlyDelivery: { featureLinkFieldId: 'customfield_10108' } } },
    );

    expect(readToolboxFieldConfig(config).parentFeature).toBe('customfield_10999');
  });

  it('returns nothing for a concept Toolbox never mapped, rather than a default', () => {
    // An unmapped concept stays unmapped. Inventing a value here would recreate
    // the exact defect this product exists to remove.
    expect(readToolboxFieldConfig(buildToolboxConfig({})).storyPoints).toBeUndefined();
  });

  it('survives a configuration with no hygiene monitor section at all', () => {
    expect(readToolboxFieldConfig({})).toEqual({});
  });
});

describe('overwriting the Jira+ field map', () => {
  /** A Jira+ field map with one concept already confirmed to something else. */
  const EXISTING = {
    storyPoints: { state: 'resolved', fieldId: 'customfield_00000', jiraName: 'Old', confirmedAt: '2026-09-01T00:00:00.000Z' },
    acceptanceCriteria: { state: 'unmapped' },
    parentFeature: { state: 'unmapped' },
    targetStart: { state: 'unmapped' },
    targetEnd: { state: 'unmapped' },
    programIncrement: { state: 'unmapped' },
  };

  it('overwrites a concept that was already mapped to something else', () => {
    // He asked for exactly this. A preview-and-confirm gate in front of his own
    // prior answers is friction, not safety.
    const { fieldMap } = buildFieldMapFromToolbox(EXISTING, { storyPoints: 'customfield_10236' });

    expect(fieldMap.storyPoints.state).toBe('resolved');
    expect(fieldMap.storyPoints.fieldId).toBe('customfield_10236');
  });

  it('leaves a concept Toolbox knew nothing about exactly as it was', () => {
    const { fieldMap } = buildFieldMapFromToolbox(EXISTING, { storyPoints: 'customfield_10236' });

    expect(fieldMap.acceptanceCriteria).toEqual(EXISTING.acceptanceCriteria);
  });

  it('reports every concept it changed, so the result can be checked', () => {
    const { changes } = buildFieldMapFromToolbox(EXISTING, {
      storyPoints: 'customfield_10236',
      targetStart: 'customfield_10101',
    });

    expect(changes).toHaveLength(2);
    expect(changes.find((change) => change.conceptId === 'storyPoints').previousFieldId).toBe(
      'customfield_00000',
    );
  });

  it('marks the import as its own source, so a mapping can be traced later', () => {
    const { fieldMap } = buildFieldMapFromToolbox(EXISTING, { storyPoints: 'customfield_10236' });

    expect(fieldMap.storyPoints.jiraName).toMatch(/toolbox/i);
  });

  it('ignores a concept Jira+ does not have, rather than inventing one', () => {
    const { fieldMap } = buildFieldMapFromToolbox(EXISTING, { somethingElse: 'customfield_1' });

    expect(fieldMap.somethingElse).toBeUndefined();
  });
});
