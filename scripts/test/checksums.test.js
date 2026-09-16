// checksums.test.js — The hash somebody quotes to IT has to be the right hash.
//
// A SHA-256 line is only useful if it matches what `Get-FileHash` and
// `certutil -hashfile` print for the same file, byte for byte, so the format is
// asserted as strictly as the digest.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildChecksumText, computeFileSha256 } from "../checksums.js";

/** SHA-256 of the three bytes "abc", from FIPS 180-4's own worked example. */
const KNOWN_SHA256_OF_ABC =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("hashing a file", () => {
  let scratchDirectory;

  beforeEach(() => {
    scratchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jiraplus-checksums-"));
  });

  afterEach(() => {
    fs.rmSync(scratchDirectory, { recursive: true, force: true });
  });

  it("produces the standard SHA-256 digest, lower-case hex", () => {
    const filePath = path.join(scratchDirectory, "abc.bin");
    fs.writeFileSync(filePath, "abc");
    expect(computeFileSha256(filePath)).toBe(KNOWN_SHA256_OF_ABC);
  });

  it("writes one sha256sum-format line per file, with forward slashes", () => {
    // Two spaces between digest and name is what sha256sum emits and what
    // `sha256sum -c` reads back. Forward slashes keep the line identical on
    // every machine that quotes it.
    fs.mkdirSync(path.join(scratchDirectory, "versions", "1.2.3"), { recursive: true });
    fs.writeFileSync(path.join(scratchDirectory, "versions", "1.2.3", "jiraplus.exe"), "abc");

    const text = buildChecksumText(scratchDirectory, [
      path.join("versions", "1.2.3", "jiraplus.exe"),
    ]);

    expect(text).toBe(`${KNOWN_SHA256_OF_ABC}  versions/1.2.3/jiraplus.exe\r\n`);
  });
});
