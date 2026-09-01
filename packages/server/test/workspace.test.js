// workspace.test.js — The configuration, and the eight characters identifying it.
//
// Each person runs their own copy of Jira+, so there is no shared store to make
// two people agree. The fingerprint does not prevent divergence; it makes
// divergence VISIBLE before anybody argues about a number.
//
// That only works if an import reproduces the exporter's fingerprint exactly,
// which is why import replaces wholly and never merges. A merge would produce a
// configuration matching neither party's, carrying a third fingerprint, and the
// mechanism would manufacture the very disagreement it exists to reveal.

import fs from 'node:fs';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDefaultWorkspaceConfiguration, computeFingerprint } from '@jira-plus/core';

import { createApp } from '../app.js';
import { WORKSPACE_FILE_PATH, describeDifferences } from '../routes/workspace.js';

/** Configuration pointed nowhere; nothing in this suite reaches Jira. */
const CONFIG = { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 0 };

/** Removes any document left by a previous run. */
function clearStoredWorkspace() {
  try {
    fs.unlinkSync(WORKSPACE_FILE_PATH);
  } catch {
    // Absent is the expected state on a first run.
  }
}

beforeEach(clearStoredWorkspace);
afterEach(clearStoredWorkspace);

/** A configuration with one concept confirmed. */
function buildMappedConfiguration() {
  const base = buildDefaultWorkspaceConfiguration();
  return {
    ...base,
    fieldMap: {
      ...base.fieldMap,
      storyPoints: {
        state: 'resolved',
        fieldId: 'customfield_10236',
        jiraName: 'Story Points',
        matchedBy: 'exact-name',
        confirmedAtIso: '2026-09-01T00:00:00.000Z',
      },
    },
  };
}

describe('a first run', () => {
  it('returns defaults rather than an error, because unconfigured is normal', async () => {
    const response = await request(createApp(CONFIG)).get('/api/workspace');

    expect(response.status).toBe(200);
    expect(response.body.isFirstRun).toBe(true);
  });

  it('maps no Jira field at all, so nothing can be confidently wrong', async () => {
    const response = await request(createApp(CONFIG)).get('/api/workspace');
    const states = Object.values(response.body.configuration.fieldMap).map((entry) => entry.state);

    expect(states.every((state) => state === 'unmapped')).toBe(true);
  });
});

describe('saving', () => {
  it('returns the fingerprint recomputed from the stored document', async () => {
    const response = await request(createApp(CONFIG))
      .put('/api/workspace')
      .send(buildMappedConfiguration());

    expect(response.status).toBe(200);
    expect(response.body.fingerprint).toBe(computeFingerprint(response.body.configuration));
  });

  it('records who saved it and when, without those affecting the fingerprint', async () => {
    const app = createApp(CONFIG);
    const first = await request(app).put('/api/workspace').send(buildMappedConfiguration());
    const second = await request(app).put('/api/workspace').send(buildMappedConfiguration());

    expect(second.body.configuration.updatedAtIso).not.toBe('');
    expect(second.body.fingerprint).toBe(first.body.fingerprint);
  });

  it('refuses a document written under different rules rather than reinterpreting it', async () => {
    const stale = { ...buildMappedConfiguration(), schemaVersion: 0 };

    const response = await request(createApp(CONFIG)).put('/api/workspace').send(stale);

    expect(response.status).toBe(400);
    expect(response.body.review.status).toBe('needs-review');
  });
});

describe('export and import', () => {
  it('exports the whole document, so an import can reproduce it exactly', async () => {
    const app = createApp(CONFIG);
    await request(app).put('/api/workspace').send(buildMappedConfiguration());

    const exported = await request(app).get('/api/workspace/export');

    expect(exported.body.fieldMap.storyPoints.fieldId).toBe('customfield_10236');
  });

  it('describes what would change before replacing anything', async () => {
    const preview = await request(createApp(CONFIG))
      .post('/api/workspace/import')
      .send({ configuration: buildMappedConfiguration() });

    expect(preview.body.requiresConfirmation).toBe(true);
    expect(preview.body.willChange).toBe(true);
    expect(preview.body.differences.join(' ')).toMatch(/storyPoints/);
  });

  it('writes nothing until the import is confirmed', async () => {
    const app = createApp(CONFIG);
    await request(app)
      .post('/api/workspace/import')
      .send({ configuration: buildMappedConfiguration() });

    const current = await request(app).get('/api/workspace');

    expect(current.body.configuration.fieldMap.storyPoints.state).toBe('unmapped');
  });

  it('reproduces the exporter fingerprint exactly, because it replaces rather than merges', async () => {
    const incoming = buildMappedConfiguration();

    const imported = await request(createApp(CONFIG))
      .post('/api/workspace/import')
      .send({ configuration: incoming, isConfirmed: true });

    expect(imported.body.fingerprint).toBe(computeFingerprint(incoming));
  });

  it('does not merge, so no third configuration can be produced', async () => {
    const app = createApp(CONFIG);
    await request(app).put('/api/workspace').send(buildMappedConfiguration());

    const incoming = {
      ...buildDefaultWorkspaceConfiguration(),
      enabledCheckIds: ['missing-fix-version'],
    };
    const imported = await request(app)
      .post('/api/workspace/import')
      .send({ configuration: incoming, isConfirmed: true });

    // The result is the incoming document, not a blend of the two.
    expect(imported.body.configuration.enabledCheckIds).toEqual(['missing-fix-version']);
    expect(imported.body.configuration.fieldMap.storyPoints.state).toBe('unmapped');
    expect(imported.body.fingerprint).toBe(computeFingerprint(incoming));
  });

  it('refuses an unreadable import rather than starting from defaults', async () => {
    const response = await request(createApp(CONFIG))
      .post('/api/workspace/import')
      .send({ configuration: { nonsense: true } });

    expect(response.status).toBe(400);
    expect(response.body.review.status).toBe('unreadable');
  });
});

describe('describeDifferences', () => {
  it('says when the definitions of finished change, because every chart moves', () => {
    const current = buildDefaultWorkspaceConfiguration();
    const incoming = {
      ...current,
      completionLenses: {
        ...current.completionLenses,
        'delivered-to-int': {
          ...current.completionLenses['delivered-to-int'],
          completedWhen: { kind: 'named-statuses', statusNames: ['Ready for QA'] },
        },
      },
    };

    expect(describeDifferences(current, incoming).join(' ')).toMatch(/every chart will move/);
  });

  it('says when the working calendar changes, because every duration moves', () => {
    const current = buildDefaultWorkspaceConfiguration();
    const incoming = {
      ...current,
      workingCalendar: { ...current.workingCalendar, holidayIsoDates: ['2026-12-25'] },
    };

    expect(describeDifferences(current, incoming).join(' ')).toMatch(/every duration will move/);
  });

  it('finds nothing to report when the documents match', () => {
    const configuration = buildDefaultWorkspaceConfiguration();

    expect(describeDifferences(configuration, configuration)).toEqual([]);
  });
});
