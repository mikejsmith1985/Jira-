// build-release.js — Assembles the zip somebody actually receives.
//
// The shape matters, and it is not arbitrary:
//
//   Launch Jira Plus.vbs                  ← double-click this
//   Launch Jira Plus (show errors).bat    ← when the first one does not work
//   current.txt                           ← which version to run
//   versions\0.1.0\jiraplus.exe           ← the whole application, one file
//   README.txt                            ← for somebody who received the zip
//
// The versions folder with a pointer file exists for one reason: Windows will
// not overwrite a running executable. An update installs beside the current one
// and flips the pointer, so an update that fails halfway leaves somebody with a
// working application rather than a broken folder.
//
// Nothing here needs Node.js, npm, a terminal, or network access at run time.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root, resolved from this file rather than the working directory. */
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the staged release is assembled before zipping. */
const STAGING_ROOT = path.join(REPOSITORY_ROOT, "build", "release");

/** Bytes in a megabyte, so a size can be reported the way people read it. */
const BYTES_PER_MEGABYTE = 1_048_576;

/** Reads the version this release will carry. */
function readVersion() {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8")).version;
}

/** The note somebody reads before they run anything. */
function buildReadmeText(version) {
  return [
    `Jira+ ${version}`,
    "",
    "TO START IT",
    "",
    "  Double-click  Launch Jira Plus.vbs",
    "",
    "  It opens your browser at http://localhost:5556. There is no installer, no",
    "  Node.js to install, and nothing to type. The first screen asks for your Jira",
    "  address and a personal access token, and that is the only thing it ever asks",
    "  you to configure.",
    "",
    "IF NOTHING HAPPENS",
    "",
    "  Double-click  Launch Jira Plus (show errors).bat",
    "",
    "  It does exactly the same thing with the window left open, so you can read",
    "  what went wrong. The two usual causes are Windows SmartScreen blocking the",
    "  program - choose 'More info' then 'Run anyway' - and port 5556 already being",
    "  in use.",
    "",
    "WHERE YOUR SETTINGS LIVE",
    "",
    "  %APPDATA%\\JiraPlus",
    "",
    "  Your Jira token, your field mappings and the log of everything Jira+ changed",
    "  are kept there, outside this folder, so they survive an update. Nothing is",
    "  sent anywhere: Jira+ talks to your Jira and to nothing else.",
    "",
    "TO UPDATE",
    "",
    "  Extract the new zip over this folder. The new version installs beside the old",
    "  one and the launcher switches to it. Your settings are untouched.",
    "",
    "TO REMOVE IT",
    "",
    "  Delete this folder. Delete %APPDATA%\\JiraPlus if you want your settings gone",
    "  too. There is nothing in the registry and nothing installed elsewhere.",
    "",
  ].join("\r\n");
}

/** Copies one file, creating the destination directory. */
function copyInto(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

/** Assembles the release. */
function main() {
  const version = readVersion();
  const executablePath = path.join(REPOSITORY_ROOT, "build", "jiraplus.exe");

  if (!fs.existsSync(executablePath)) {
    console.error(
      "There is no executable to package. Run `npm run build:exe` first — the zip carries the " +
        "application, and there is nothing to carry yet.",
    );
    process.exit(1);
  }

  fs.rmSync(STAGING_ROOT, { recursive: true, force: true });
  fs.mkdirSync(STAGING_ROOT, { recursive: true });

  // The application, under its version. The launcher finds it by the pointer.
  copyInto(executablePath, path.join(STAGING_ROOT, "versions", version, "jiraplus.exe"));

  // The pointer. One line, deliberately: a human can read and repair it.
  fs.writeFileSync(path.join(STAGING_ROOT, "current.txt"), `${version}\r\n`, "utf8");

  for (const launcherName of ["Launch Jira Plus.vbs", "Launch Jira Plus (show errors).bat"]) {
    copyInto(
      path.join(REPOSITORY_ROOT, "launchers", launcherName),
      path.join(STAGING_ROOT, launcherName),
    );
  }

  fs.writeFileSync(path.join(STAGING_ROOT, "README.txt"), buildReadmeText(version), "utf8");

  const zipPath = path.join(REPOSITORY_ROOT, "build", `jira-plus-v${version}.zip`);
  fs.rmSync(zipPath, { force: true });

  // Compress-Archive is built into Windows, so producing a release needs nothing
  // installed that a Windows machine does not already have.
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_ROOT}\\*' ` +
      `-DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );

  const sizeInMegabytes = (fs.statSync(zipPath).size / BYTES_PER_MEGABYTE).toFixed(1);
  console.log(`\nBuilt ${zipPath} (${sizeInMegabytes} MB).`);
  console.log("Send that file. Extract it anywhere, double-click the .vbs, done.");
}

main();
