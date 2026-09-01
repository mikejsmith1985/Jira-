// structuralRules.test.ts — Rules a future contributor cannot accidentally break.
//
// Every other test here proves the code works today. These prove that the shape
// of the codebase stops it going wrong tomorrow, by reading the source and
// refusing patterns rather than behaviours.
//
// This matters because the predecessor's defects were not written by careless
// people. They were written by people adding a check the way the surrounding
// code had always done it. A rule that only lives in a document loses to that;
// a rule that fails the build does not.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ALL_CHECKS } from "../src/checks/registry.js";

/**
 * Where the engine's source lives.
 *
 * Resolved from this file rather than from the working directory, because the
 * test runner starts at the repository root and a rule that silently scans an
 * empty directory would pass while proving nothing.
 */
const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every `.ts` file under a directory, as absolute paths. */
function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entryName) => {
    const entryPath = join(directory, entryName);
    if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
    return entryName.endsWith(".ts") ? [entryPath] : [];
  });
}

/** Files under one area of the engine. */
function listFilesUnder(...segments: readonly string[]): readonly string[] {
  return listSourceFiles(join(SOURCE_ROOT, ...segments));
}

/** Reads a file, stripped of comments so a rule cannot fail on its own explanation. */
function readCode(filePath: string): string {
  return readFileSync(filePath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("no rule may name a raw Jira field id", () => {
  it("keeps every customfield literal inside the field-mapping area", () => {
    const offenders: string[] = [];

    for (const filePath of listSourceFiles(SOURCE_ROOT)) {
      const isFieldMappingArea = filePath.includes(join("src", "fields"));
      if (isFieldMappingArea) continue;
      if (/customfield_\d+/.test(readCode(filePath))) offenders.push(filePath);
    }

    // The predecessor kept two independently-maintained tables of default field
    // ids. One of them was wrong for this instance, and the checks reading it
    // reported clean zeros for months.
    expect(offenders).toEqual([]);
  });

  it("ships no default field id at all, not even in the field-mapping area", () => {
    for (const filePath of listFilesUnder("fields")) {
      const code = readCode(filePath);
      // Names of fields are fine; ids are not. A default id is a guess about
      // somebody else's Jira, and this product may be unconfigured but never
      // confidently wrong.
      expect(code).not.toMatch(/customfield_\d+/);
    }
  });
});

/**
 * Every import in a file, split by whether it survives to runtime.
 *
 * The distinction is not a technicality. An `import type` is erased by the
 * compiler, so it names a shape and cannot call anything; a value import is a
 * live reference. Only the second could ever reach Jira.
 */
function listImports(code: string): { readonly typeOnly: string[]; readonly value: string[] } {
  const typeOnly: string[] = [];
  const value: string[] = [];

  for (const match of code.matchAll(/import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g)) {
    const specifier = match[2] ?? "";
    if (match[1] === undefined) value.push(specifier);
    else typeOnly.push(specifier);
  }

  return { typeOnly, value };
}

describe("no check may reach Jira", () => {
  it("imports no Jira module as a value, so nothing in a check can call out", () => {
    for (const filePath of listFilesUnder("checks")) {
      const jiraValueImports = listImports(readCode(filePath)).value.filter((specifier) =>
        specifier.includes("/jira/"),
      );

      // The only exception is the JQL builder, which assembles text and sends
      // nothing — a check needs it to describe its own drill-through.
      for (const specifier of jiraValueImports) {
        expect(specifier, `${filePath} may only import jqlValue from the Jira area`).toMatch(
          /jqlValue/,
        );
      }
    }
  });

  it("never imports the retrieval functions, even as types", () => {
    for (const filePath of listFilesUnder("checks")) {
      const code = readCode(filePath);
      expect(code).not.toMatch(/\/jira\/(dataCenterAdapter|fetchIssueSet|fetchIssuesPaged)/);
    }
  });
});

describe("every check is reachable", () => {
  it("registers every definition file that exports one", () => {
    const registered = new Set(ALL_CHECKS.map((check) => check.checkId));
    const declaredIds: string[] = [];

    for (const filePath of listFilesUnder("checks", "builtins")) {
      const code = readCode(filePath);
      const match = /checkId:\s*["']([^"']+)["']/.exec(code);
      if (match?.[1] !== undefined) declaredIds.push(match[1]);
    }

    // The predecessor's `dates-out-of-sync` was computed on every scan and then
    // filtered out of every result, because it had been added to three lists and
    // not the fourth. It never fired in the live product and nobody knew.
    expect(declaredIds.length).toBeGreaterThan(0);
    for (const declaredId of declaredIds) {
      expect(registered.has(declaredId), `${declaredId} is declared but not registered`).toBe(true);
    }
  });

  it("declares every registered check in exactly one file", () => {
    expect(ALL_CHECKS.length).toBe(new Set(ALL_CHECKS.map((check) => check.checkId)).size);
  });
});

describe("the measurement constructor is the only one", () => {
  it("builds a Measure nowhere except in measure.ts", () => {
    const offenders: string[] = [];

    for (const filePath of listSourceFiles(SOURCE_ROOT)) {
      if (filePath.includes(join("src", "measure"))) continue;
      // A literal object carrying a measured state would bypass every invariant.
      if (/state:\s*["']measured["']/.test(readCode(filePath))) offenders.push(filePath);
    }

    expect(offenders).toEqual([]);
  });
});

describe("no sprint reaches the flow engine", () => {
  it("never reads a sprint field, because these measures must survive Kanban", () => {
    for (const filePath of listFilesUnder("flow")) {
      const code = readCode(filePath).toLowerCase();
      expect(code).not.toContain("sprint");
    }
  });
});

describe("every file explains itself", () => {
  it("opens with a purpose comment, per Article IV", () => {
    const offenders: string[] = [];

    for (const filePath of listSourceFiles(SOURCE_ROOT)) {
      const firstLine = readFileSync(filePath, "utf8").split("\n")[0] ?? "";
      if (!firstLine.trimStart().startsWith("//")) offenders.push(filePath);
    }

    expect(offenders).toEqual([]);
  });
});
