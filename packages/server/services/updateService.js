// updateService.js — Finding, fetching and installing the next version.
//
// An update nobody installs is a fix nobody receives, and downloading a zip from
// a website by hand is a step nobody performs twice. So Jira+ checks for itself
// and can fetch the next version without anybody visiting GitHub.
//
// The install order is the load-bearing part, and it follows from one Windows
// fact: a running executable cannot be overwritten. So a new version is written
// to `versions/<new>` BESIDE the running one, verified, and only then does
// `current.txt` change to point at it. Interrupt this at any point — a dropped
// connection, a killed process, a full disk — and the previous version is still
// installed and still pointed at. The worst outcome is a wasted folder, never a
// machine that will not start.
//
// Nothing here reaches Jira, and nothing here needs a credential. The repository
// is public, so the check is an unauthenticated request; on a machine that
// cannot reach GitHub it fails as "could not check", which is a normal state
// rather than an error.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isTargetTheRunningVersion } from './versionService.js';

/** Where releases are published. Public, so no credential is involved. */
const LATEST_RELEASE_URL = 'https://api.github.com/repos/mikejsmith1985/Jira-/releases/latest';

/** Seconds to wait for GitHub before calling the check impossible. */
const CHECK_TIMEOUT_MS = 10000;

/** Filename of the pointer naming the version to run. */
const POINTER_FILENAME = 'current.txt';

/** Folder holding one subfolder per installed version. */
const VERSIONS_DIRECTORY = 'versions';

/** The executable inside each version folder. */
const PAYLOAD_FILENAME = 'jiraplus.exe';

/** How many parts a version number is compared over. */
const VERSION_PART_COUNT = 3;

/**
 * Strips a leading "v" and splits a version into numbers.
 *
 * A missing part reads as zero rather than as unknown, so "0.2" and "0.2.0" are
 * the same version — which they are.
 */
function readVersionParts(versionText) {
  const parts = String(versionText).replace(/^v/i, '').split('.');
  return Array.from({ length: VERSION_PART_COUNT }, (unused, index) => {
    const parsed = Number.parseInt(parts[index] ?? '0', 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
}

/**
 * Compares two versions by NUMBER.
 *
 * String comparison gets this wrong silently — "0.1.10" sorts before "0.1.9" —
 * and the only symptom is that the update quietly stops being offered.
 *
 * @returns positive when the first is newer, negative when older, zero when equal.
 */
function compareVersions(firstVersion, secondVersion) {
  const first = readVersionParts(firstVersion);
  const second = readVersionParts(secondVersion);
  for (let i = 0; i < VERSION_PART_COUNT; i += 1) {
    if (first[i] !== second[i]) return first[i] - second[i];
  }
  return 0;
}

/** Is the candidate genuinely newer than what is running? */
function isNewerVersion(candidateVersion, installedVersion) {
  return compareVersions(candidateVersion, installedVersion) > 0;
}

/** The zip attached to a release, or null when it carries none. */
function readAssetName(release) {
  const asset = (release.assets ?? []).find((candidate) => candidate.name?.endsWith('.zip'));
  return asset === undefined ? null : asset.name;
}

/** The download URL for a release's zip, or null when it carries none. */
function readAssetUrl(release) {
  const asset = (release.assets ?? []).find((candidate) => candidate.name?.endsWith('.zip'));
  return asset === undefined ? null : asset.browser_download_url;
}

/**
 * Where this installation lives, or null when running from source.
 *
 * Under `npm run dev` there is no versions folder and no pointer, and writing an
 * executable into a repository would be worse than refusing.
 */
function findInstallRoot() {
  // process.execPath is the packaged exe itself: versions/<v>/jiraplus.exe
  const executableDirectory = path.dirname(process.execPath);
  const installRoot = path.resolve(executableDirectory, '..', '..');
  const isPackagedLayout =
    path.basename(executableDirectory).match(/^\d/) !== null &&
    path.basename(path.dirname(executableDirectory)) === VERSIONS_DIRECTORY;
  return isPackagedLayout ? installRoot : null;
}

/**
 * Asks GitHub what the newest published release is.
 *
 * A machine that cannot reach GitHub is a normal state for this application, so
 * failure returns null rather than throwing: the interface says "could not
 * check", which is honest, instead of claiming to be up to date, which is not.
 */
async function fetchLatestRelease() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** What the interface needs to know about updates. */
async function checkForUpdate(installedVersion) {
  const release = await fetchLatestRelease();
  if (release === null) {
    return {
      installedVersion,
      isCheckPossible: false,
      isUpdateAvailable: false,
      latestVersion: null,
      releaseUrl: null,
      reason: 'GitHub could not be reached. This machine may not have access to it.',
    };
  }

  const latestVersion = String(release.tag_name ?? '').replace(/^v/i, '');
  return {
    installedVersion,
    isCheckPossible: true,
    isUpdateAvailable:
      latestVersion.length > 0 &&
      isNewerVersion(latestVersion, installedVersion) &&
      readAssetUrl(release) !== null,
    latestVersion: latestVersion.length > 0 ? latestVersion : null,
    releaseUrl: release.html_url ?? null,
    reason: null,
  };
}

/** Downloads the release zip to a temporary file. */
async function downloadZip(assetUrl, destinationPath) {
  const response = await fetch(assetUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`The download failed with status ${response.status}.`);
  fs.writeFileSync(destinationPath, Buffer.from(await response.arrayBuffer()));
}

/**
 * Extracts the new executable from the downloaded zip.
 *
 * Expand-Archive ships with Windows, so producing and consuming a release needs
 * nothing installed that a Windows machine does not already have.
 */
function extractZip(zipPath, destinationDirectory) {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destinationDirectory}' -Force`,
    ],
    { stdio: 'ignore' },
  );
}

/**
 * Installs the newest release beside the running one and flips the pointer.
 *
 * The pointer moves LAST and only after the executable is confirmed on disk, so
 * an interrupted update leaves the previous version installed and selected.
 */
async function installUpdate(installedVersion) {
  const installRoot = findInstallRoot();
  if (installRoot === null) {
    return {
      isInstalled: false,
      reason:
        'Updates install only into a packaged copy of Jira+. This looks like it is running from source.',
    };
  }

  const release = await fetchLatestRelease();
  const assetUrl = release === null ? null : readAssetUrl(release);
  if (assetUrl === null) {
    return { isInstalled: false, reason: 'No downloadable release was found.' };
  }

  const latestVersion = String(release.tag_name ?? '').replace(/^v/i, '');
  if (!isNewerVersion(latestVersion, installedVersion)) {
    return { isInstalled: false, reason: 'This is already the newest version.' };
  }

  const stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiraplus-update-'));
  try {
    const zipPath = path.join(stagingDirectory, 'update.zip');
    await downloadZip(assetUrl, zipPath);
    extractZip(zipPath, stagingDirectory);

    const stagedPayload = path.join(
      stagingDirectory,
      VERSIONS_DIRECTORY,
      latestVersion,
      PAYLOAD_FILENAME,
    );
    if (!fs.existsSync(stagedPayload)) {
      return { isInstalled: false, reason: 'The downloaded release did not contain the program.' };
    }

    // Written BESIDE the running version. Windows will not overwrite a running
    // executable, and this is also what makes the step reversible.
    const targetDirectory = path.join(installRoot, VERSIONS_DIRECTORY, latestVersion);

    // The guard that does not depend on the version number being right. When it
    // was wrong, this is the copy that was attempted - the running executable
    // over itself - and Windows answered with a raw EBUSY. A refusal naming the
    // cause is worth more than an error code.
    if (isTargetTheRunningVersion(targetDirectory, process.execPath)) {
      return {
        isInstalled: false,
        reason:
          `This copy is already running from version ${latestVersion}. ` +
          `There is nothing newer to install.`,
      };
    }
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.copyFileSync(stagedPayload, path.join(targetDirectory, PAYLOAD_FILENAME));

    // The pointer moves only now, once the new version is verifiably on disk.
    fs.writeFileSync(path.join(installRoot, POINTER_FILENAME), `${latestVersion}\r\n`, 'utf8');

    return {
      isInstalled: true,
      installedVersion: latestVersion,
      reason: null,
    };
  } catch (error) {
    return { isInstalled: false, reason: error.message };
  } finally {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

export {
  CHECK_TIMEOUT_MS,
  LATEST_RELEASE_URL,
  checkForUpdate,
  compareVersions,
  findInstallRoot,
  installUpdate,
  isNewerVersion,
  readAssetName,
  readAssetUrl,
};
