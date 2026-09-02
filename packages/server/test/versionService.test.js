// versionService.test.js — Knowing which version you actually are.
//
// v0.1.3 reported itself as 0.0.0. The version was read from package.json at a
// path relative to the source tree, and inside the packaged executable that path
// does not exist, so every packaged build silently fell back to the placeholder.
//
// That single wrong answer produced the visible failure. Believing it was 0.0.0,
// the updater treated 0.1.3 as an upgrade, computed its target as
// versions/0.1.3 - the folder the RUNNING executable lives in - and tried to
// copy over itself. Windows refused with EBUSY, which is exactly the situation
// the whole install-beside-it design exists to make impossible.
//
// So two rules. The version is baked in at build time, because a build that has
// to find a file to know what it is will one day not find it. And the installer
// refuses to write into the folder it is running from, whatever the version
// numbers claim - a guard that does not depend on the number being right.

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isTargetTheRunningVersion, resolveInstalledVersion } from '../services/versionService.js';

describe('resolving the running version', () => {
  it('uses the version baked in at build time', () => {
    expect(resolveInstalledVersion('0.1.4', () => null)).toBe('0.1.4');
  });

  it('prefers the baked version over anything found on disk', () => {
    // A stray package.json beside a packaged executable must not be able to
    // rename the build. What the build says it is, it is.
    expect(resolveInstalledVersion('0.1.4', () => '9.9.9')).toBe('0.1.4');
  });

  it('falls back to the manifest when running from source, where nothing is baked', () => {
    expect(resolveInstalledVersion(undefined, () => '0.1.4')).toBe('0.1.4');
  });

  it('never reports the placeholder when a real version is available', () => {
    expect(resolveInstalledVersion('0.1.4', () => null)).not.toBe('0.0.0');
  });

  it('reports the placeholder only when nothing at all is known', () => {
    // Honest, and it stays visible: a build calling itself 0.0.0 on screen is a
    // bug report, which is how this one was found.
    expect(resolveInstalledVersion(undefined, () => null)).toBe('0.0.0');
  });

  it('ignores an empty baked value rather than reporting an empty version', () => {
    expect(resolveInstalledVersion('', () => '0.1.4')).toBe('0.1.4');
  });
});

describe('refusing to overwrite the running copy', () => {
  /** Where a packaged copy of 0.1.3 lives. */
  const RUNNING_EXECUTABLE = path.join('C:', 'app', 'versions', '0.1.3', 'jiraplus.exe');

  it('recognises the folder the running executable came from', () => {
    // This is the guard that would have turned EBUSY into a sentence.
    const target = path.join('C:', 'app', 'versions', '0.1.3');

    expect(isTargetTheRunningVersion(target, RUNNING_EXECUTABLE)).toBe(true);
  });

  it('allows a genuinely different version folder', () => {
    const target = path.join('C:', 'app', 'versions', '0.1.4');

    expect(isTargetTheRunningVersion(target, RUNNING_EXECUTABLE)).toBe(false);
  });

  it('compares paths rather than text, so a trailing separator changes nothing', () => {
    const target = `${path.join('C:', 'app', 'versions', '0.1.3')}${path.sep}`;

    expect(isTargetTheRunningVersion(target, RUNNING_EXECUTABLE)).toBe(true);
  });

  it('is case-insensitive, because Windows paths are', () => {
    const target = path.join('C:', 'APP', 'Versions', '0.1.3');

    expect(isTargetTheRunningVersion(target, RUNNING_EXECUTABLE)).toBe(true);
  });
});
