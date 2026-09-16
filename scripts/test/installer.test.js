// installer.test.js — The double-click that turns a shared folder into a private copy.
//
// This runs the REAL "Install Jira Plus.vbs" under cscript against a staged
// release folder, because a launcher that is only read and never executed is
// the launcher that shows a dialog thirty seconds after every start. Windows
// only: Windows Script Host is the runtime the script targets.
//
// The /testroot argument is the script's single test seam. It redirects the
// install folder and the Start Menu folder under one scratch directory and
// suppresses both the launch and every dialog, so nothing here touches the
// machine it runs on.

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAUNCHERS_DIRECTORY = path.join(REPOSITORY_ROOT, "launchers");
const INSTALLER_FILENAME = "Install Jira Plus.vbs";
const LAUNCHER_FILENAMES = [
  "Launch Jira Plus.vbs",
  "Launch Jira Plus (show errors).bat",
  "Stop Jira Plus.vbs",
];

/** Generous, because cscript startup plus a refused stop request can take a while. */
const INSTALLER_TIMEOUT_MS = 30_000;

const isWindows = process.platform === "win32";

/** Lays out a release folder the way build-release.js does, with a stub exe. */
function stageRelease(sourceRoot, version, payloadContent) {
  fs.mkdirSync(path.join(sourceRoot, "versions", version), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "versions", version, "jiraplus.exe"), payloadContent);
  fs.writeFileSync(path.join(sourceRoot, "current.txt"), `${version}\r\n`);
  fs.writeFileSync(path.join(sourceRoot, "README.txt"), "stub readme");
  for (const launcherName of [INSTALLER_FILENAME, ...LAUNCHER_FILENAMES]) {
    fs.copyFileSync(
      path.join(LAUNCHERS_DIRECTORY, launcherName),
      path.join(sourceRoot, launcherName),
    );
  }
}

/** Runs the installer exactly as a double-click would, minus the launch. */
function runInstaller(sourceRoot, testRoot) {
  const result = spawnSync(
    "cscript",
    ["//nologo", path.join(sourceRoot, INSTALLER_FILENAME), `/testroot:${testRoot}`],
    { encoding: "utf8", timeout: INSTALLER_TIMEOUT_MS },
  );
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

function readPointer(installRoot) {
  return fs.readFileSync(path.join(installRoot, "current.txt"), "utf8").trim();
}

describe.skipIf(!isWindows)("installing from a shared folder", () => {
  let scratchDirectory;
  let sourceRoot;
  let testRoot;
  let installRoot;

  beforeEach(() => {
    scratchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jiraplus-install-"));
    sourceRoot = path.join(scratchDirectory, "Team Folder");
    testRoot = path.join(scratchDirectory, "machine");
    installRoot = path.join(testRoot, "JiraPlus");
    fs.mkdirSync(sourceRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(scratchDirectory, { recursive: true, force: true });
  });

  it("copies the version, the launchers and the pointer into a private folder", () => {
    stageRelease(sourceRoot, "0.9.9", "payload-0.9.9");

    const { exitCode, output } = runInstaller(sourceRoot, testRoot);

    expect(exitCode, output).toBe(0);
    expect(
      fs.readFileSync(path.join(installRoot, "versions", "0.9.9", "jiraplus.exe"), "utf8"),
    ).toBe("payload-0.9.9");
    for (const launcherName of LAUNCHER_FILENAMES) {
      expect(fs.existsSync(path.join(installRoot, launcherName)), launcherName).toBe(true);
    }
    expect(readPointer(installRoot)).toBe("0.9.9");
  });

  it("puts a Jira Plus entry in the Start Menu that opens the local launcher", () => {
    stageRelease(sourceRoot, "0.9.9", "payload-0.9.9");

    runInstaller(sourceRoot, testRoot);

    // The shortcut is a binary .lnk; the launcher path is stored inside it as
    // UTF-16, so it is searched for in that encoding.
    const shortcutPath = path.join(testRoot, "Start Menu", "Jira Plus.lnk");
    expect(fs.existsSync(shortcutPath)).toBe(true);
    const shortcutBytes = fs.readFileSync(shortcutPath);
    const launcherPathUtf16 = Buffer.from(
      path.join(installRoot, "Launch Jira Plus.vbs"),
      "utf16le",
    );
    expect(shortcutBytes.includes(launcherPathUtf16)).toBe(true);
  });

  it("installs a newer version beside the old one and moves the pointer", () => {
    stageRelease(sourceRoot, "0.9.9", "payload-0.9.9");
    runInstaller(sourceRoot, testRoot);

    stageRelease(sourceRoot, "0.10.0", "payload-0.10.0");
    const { exitCode, output } = runInstaller(sourceRoot, testRoot);

    expect(exitCode, output).toBe(0);
    expect(fs.existsSync(path.join(installRoot, "versions", "0.9.9", "jiraplus.exe"))).toBe(true);
    expect(fs.existsSync(path.join(installRoot, "versions", "0.10.0", "jiraplus.exe"))).toBe(true);
    expect(readPointer(installRoot)).toBe("0.10.0");
  });

  it("never moves the pointer backwards when the team folder is behind", () => {
    // Somebody who took an update from GitHub is ahead of the shared folder.
    // Re-running the installer must not quietly downgrade them.
    stageRelease(sourceRoot, "0.10.0", "payload-0.10.0");
    runInstaller(sourceRoot, testRoot);

    stageRelease(sourceRoot, "0.9.9", "payload-0.9.9");
    const { exitCode, output } = runInstaller(sourceRoot, testRoot);

    expect(exitCode, output).toBe(0);
    expect(readPointer(installRoot)).toBe("0.10.0");
    expect(output).toMatch(/newer/i);
  });

  it("refuses when the folder it sits in has no program to install", () => {
    fs.copyFileSync(
      path.join(LAUNCHERS_DIRECTORY, INSTALLER_FILENAME),
      path.join(sourceRoot, INSTALLER_FILENAME),
    );

    const { exitCode, output } = runInstaller(sourceRoot, testRoot);

    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/could not find/i);
    expect(fs.existsSync(installRoot)).toBe(false);
  });
});
