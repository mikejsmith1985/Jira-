// versionService.js — What version this build is, and where it must not write.
//
// v0.1.3 reported itself as 0.0.0. The version was read from package.json at a
// path relative to the source tree, which does not exist inside the packaged
// executable, so every packaged build fell silently back to the placeholder.
//
// That one wrong answer produced the visible failure. Believing it was 0.0.0,
// the updater treated 0.1.3 as an upgrade, computed its target as
// `versions/0.1.3` — the folder the RUNNING executable lives in — and tried to
// copy over itself. Windows refused with EBUSY, which is precisely the situation
// the install-beside-it design exists to make impossible.
//
// Hence two rules here. The version is baked in when the bundle is built,
// because a build that must find a file to know what it is will one day not find
// it. And the installer refuses to write into the folder it is running from
// whatever the version numbers claim — a guard that holds even when the number
// is wrong, which is the only kind worth having.

import path from 'node:path';

/** What a build reports when it genuinely does not know. Visible on purpose. */
const UNKNOWN_VERSION = '0.0.0';

/**
 * The version this process is.
 *
 * @param {string|undefined} bakedVersion Substituted into the bundle at build time.
 * @param {() => string|null} readManifestVersion Used only when running from source.
 */
function resolveInstalledVersion(bakedVersion, readManifestVersion) {
  if (typeof bakedVersion === 'string' && bakedVersion.length > 0) return bakedVersion;
  return readManifestVersion() ?? UNKNOWN_VERSION;
}

/**
 * Would installing here overwrite the executable currently running?
 *
 * Compared as resolved paths rather than as text, and case-insensitively,
 * because Windows paths are — and because the whole point of this check is that
 * it must not be defeated by a trailing separator or a capital letter.
 */
function isTargetTheRunningVersion(targetDirectory, runningExecutablePath) {
  const target = path.resolve(targetDirectory).toLowerCase();
  const running = path.resolve(path.dirname(runningExecutablePath)).toLowerCase();
  return target === running;
}

export { UNKNOWN_VERSION, isTargetTheRunningVersion, resolveInstalledVersion };
