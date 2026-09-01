// updateService.test.js — The decisions an update gets wrong silently.
//
// Every assertion here covers something whose failure produces no error message
// at all. A version compared as a string simply stops offering updates. A
// release read for the wrong asset downloads nothing. An install that runs from
// a source tree writes an executable into a repository.
//
// The install ORDER is the one thing not asserted here, because it is a
// filesystem sequence rather than a function: the new version is written to
// versions/<new> beside the running one and current.txt moves only afterwards,
// so an interruption leaves the previous version installed and selected.

import { describe, expect, it } from 'vitest';

import {
  compareVersions,
  isNewerVersion,
  readAssetName,
  readAssetUrl,
} from '../services/updateService.js';

describe('comparing versions', () => {
  it('orders by number, not by string, so 0.1.10 beats 0.1.9', () => {
    // The string comparison everyone reaches for first gets this exactly wrong,
    // and gets it wrong silently: the update simply stops being offered.
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0);
  });

  it('treats equal versions as equal however they were written', () => {
    expect(compareVersions('v0.1.1', '0.1.1')).toBe(0);
  });

  it('treats a missing patch part as zero rather than as unknown', () => {
    expect(compareVersions('0.2', '0.2.0')).toBe(0);
  });

  it('does not let a large patch outrank a larger minor', () => {
    expect(compareVersions('0.1.99', '0.2.0')).toBeLessThan(0);
  });

  it('reads a non-numeric part as zero rather than producing NaN', () => {
    // NaN comparisons are all false, so a malformed tag would make every
    // comparison say "not newer" — an update that vanishes without a message.
    expect(compareVersions('0.1.x', '0.1.0')).toBe(0);
  });
});

describe('deciding whether to offer an update', () => {
  it('says a newer version is newer', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true);
  });

  it('does not offer an update to the version already running', () => {
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false);
  });

  it('does not offer a downgrade', () => {
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
  });
});

describe('reading the release', () => {
  /** A release carrying both a zip and something that is not one. */
  const RELEASE = {
    tag_name: 'v0.1.2',
    assets: [
      { name: 'checksums.txt', browser_download_url: 'https://example.invalid/checksums.txt' },
      { name: 'jira-plus-v0.1.2.zip', browser_download_url: 'https://example.invalid/a.zip' },
    ],
  };

  it('picks the zip, ignoring anything else attached to a release', () => {
    expect(readAssetName(RELEASE)).toBe('jira-plus-v0.1.2.zip');
    expect(readAssetUrl(RELEASE)).toBe('https://example.invalid/a.zip');
  });

  it('returns null when a release carries no zip, rather than guessing', () => {
    const release = { tag_name: 'v0.1.2', assets: [{ name: 'notes.md', browser_download_url: '' }] };

    expect(readAssetName(release)).toBeNull();
    expect(readAssetUrl(release)).toBeNull();
  });

  it('returns null when a release carries no assets at all', () => {
    expect(readAssetUrl({ tag_name: 'v0.1.2' })).toBeNull();
  });
});
