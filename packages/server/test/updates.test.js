// updates.test.js — Getting the next version without visiting a website.
//
// Downloading a zip from GitHub by hand is a step nobody performs twice, so an
// update nobody installs is a fix nobody receives. This route exists so the
// application can tell you a newer version exists and fetch it for you.
//
// The install layout does the dangerous part. Windows will not overwrite a
// running executable, so a new version is written to `versions/<new>` BESIDE
// the running one and `current.txt` is flipped only after the file is on disk
// and verified. An update interrupted at any point therefore leaves the previous
// version still pointed at and still working, which is the only acceptable
// failure mode for something a person double-clicks on a Monday morning.
//
// The pure decisions this route delegates - comparing versions, reading a
// release's assets - are asserted in updateService.test.js. What is asserted
// here is only what the ROUTE promises its caller.

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';

/** Configuration pointed nowhere; nothing in this suite reaches Jira. */
const CONFIG = { baseUrl: '', personalAccessToken: '', isSslVerified: true, port: 0 };

describe('checking for an update', () => {
  it('reports the running version even when GitHub cannot be reached', async () => {
    // The work machine this ships to may not reach github.com at all. That is a
    // normal state, not an error: the answer is "could not check", never a
    // stack trace and never a silent claim of being up to date.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND'); }));

    const response = await request(createApp(CONFIG)).get('/api/update/check');

    expect(response.status).toBe(200);
    expect(response.body.installedVersion).toBeTruthy();
    expect(response.body.isCheckPossible).toBe(false);
    expect(response.body.isUpdateAvailable).toBe(false);
  });

  it('offers the update when the published release is newer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          tag_name: 'v99.0.0',
          html_url: 'https://example.invalid/releases/v99.0.0',
          assets: [
            { name: 'jira-plus-v99.0.0.zip', browser_download_url: 'https://example.invalid/a.zip' },
          ],
        }),
      })),
    );

    const response = await request(createApp(CONFIG)).get('/api/update/check');

    expect(response.body.isUpdateAvailable).toBe(true);
    expect(response.body.latestVersion).toBe('99.0.0');
  });

  it('does not offer an update when the published release is the running one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v0.0.1', html_url: '', assets: [] }),
      })),
    );

    const response = await request(createApp(CONFIG)).get('/api/update/check');

    expect(response.body.isUpdateAvailable).toBe(false);
  });
});

describe('installing an update', () => {
  it('refuses when running from source rather than corrupting a dev tree', async () => {
    // Under `npm run dev` there is no versions folder and no pointer to flip.
    // Refusing with a reason beats writing an executable into a repository.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          tag_name: 'v99.0.0',
          html_url: '',
          assets: [
            { name: 'jira-plus-v99.0.0.zip', browser_download_url: 'https://example.invalid/a.zip' },
          ],
        }),
      })),
    );

    const response = await request(createApp(CONFIG)).post('/api/update/install');

    expect(response.status).toBe(409);
    expect(response.body.reason).toMatch(/packaged|source/i);
  });
});
