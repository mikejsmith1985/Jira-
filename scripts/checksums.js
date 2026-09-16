// checksums.js — The SHA-256 lines shipped beside the executable.
//
// An unsigned executable in a locked-down environment sometimes needs to be
// allowed by name and by hash. A person can produce the hash themselves with
// `Get-FileHash` or `certutil -hashfile`, but only if they know that is the
// question — shipping the answer in the zip means an AppLocker or antivirus
// exception can be requested by quoting one line, without a conversation.
//
// Framework-first: Node's own crypto module computes the digest; this file
// only fixes the line format, which is sha256sum's so that `sha256sum -c`
// and every checksum tool that reads that format accept it unchanged.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** sha256sum separates digest and name with exactly two spaces. */
const SHA256SUM_SEPARATOR = "  ";

/** Computes the lower-case hex SHA-256 digest of one file. */
export function computeFileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Builds the text of a SHA256SUMS file for the given paths, relative to a root.
 *
 * Paths are written with forward slashes whatever the platform, so the line a
 * person quotes from Windows is the same line a checksum tool produces
 * anywhere else. Lines end in CRLF because Notepad is where it will be opened.
 */
export function buildChecksumText(rootDirectory, relativePaths) {
  return relativePaths
    .map((relativePath) => {
      const digest = computeFileSha256(path.join(rootDirectory, relativePath));
      const portableName = relativePath.split(path.sep).join("/");
      return `${digest}${SHA256SUM_SEPARATOR}${portableName}\r\n`;
    })
    .join("");
}
