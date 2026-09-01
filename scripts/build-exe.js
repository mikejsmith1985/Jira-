// build-exe.js — Produces the single file the user actually runs.
//
// Jira+ is used inside a locked-down corporate environment. Node is not
// necessarily on PATH, the npm registry is not necessarily reachable, and a
// terminal is not necessarily something people want to open. So the artifact is
// one executable that carries its own runtime, its own dependencies and the
// built client inside it. Extract a zip, double-click, done.
//
// Two steps, and the first exists because of the second. `pkg` expects
// CommonJS, while this project is ES modules throughout — so esbuild bundles the
// server and every package it imports into one CommonJS file first. That also
// means the engine, the routes and the config loader arrive as one file with no
// `node_modules` to ship beside them.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/** Repository root, resolved from this file rather than the working directory. */
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the bundled CommonJS server is written, before packaging. */
const BUNDLE_PATH = path.join(REPOSITORY_ROOT, "build", "jiraplus-server.cjs");

/** Where the finished executable lands. */
const EXECUTABLE_PATH = path.join(REPOSITORY_ROOT, "build", "jiraplus.exe");

/** The Node runtime baked into the executable. */
const PKG_TARGET = "node20-win-x64";

/** Bytes in a megabyte, so a size can be reported the way people read it. */
const BYTES_PER_MEGABYTE = 1_048_576;

/** Reads the version the release will carry. */
function readVersion() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
  );
  return manifest.version;
}

/**
 * Bundles the server into one CommonJS file.
 *
 * Everything the server imports comes with it, including `@jira-plus/core` —
 * which is what lets the executable ship without a `node_modules` directory
 * beside it.
 */
async function bundleServer() {
  await build({
    entryPoints: [path.join(REPOSITORY_ROOT, "packages", "server", "server.js")],
    outfile: BUNDLE_PATH,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    minify: false,
    sourcemap: false,
    // Kept external so pkg can resolve them from its own snapshot rather than
    // inlining a bundler-mangled copy.
    external: [],

    // `import.meta.url` has no meaning in CommonJS, and the server uses it to
    // find the built client. Rather than rewriting the source to CommonJS —
    // which would make the packaged build a different program from the one the
    // tests exercise — it is defined here in terms of the CommonJS equivalents,
    // so both builds locate the same files by the same logic.
    define: { "import.meta.url": "__jiraPlusModuleUrl" },
    banner: {
      js: [
        "// Bundled by scripts/build-exe.js. Do not edit; edit the source under",
        "// packages/ and rebuild.",
        "const __jiraPlusModuleUrl = require('url').pathToFileURL(__filename).href;",
      ].join("\n"),
    },
  });
}

/**
 * Writes the manifest pkg reads.
 *
 * The built client is declared as an asset so the whole interface travels inside
 * the executable. Without this the exe starts and serves nothing, which is a
 * confusing way to fail.
 */
function writePkgManifest() {
  const manifestPath = path.join(REPOSITORY_ROOT, "build", "pkg-package.json");
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        name: "jiraplus",
        version: readVersion(),
        bin: "jiraplus-server.cjs",
        pkg: {
          assets: ["../packages/client/dist/**/*"],
          targets: [PKG_TARGET],
          outputPath: ".",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return manifestPath;
}

/** Builds the executable. */
async function main() {
  const version = readVersion();
  console.log(`Building Jira+ ${version} as a single executable.`);

  fs.mkdirSync(path.join(REPOSITORY_ROOT, "build"), { recursive: true });

  const clientDistPath = path.join(REPOSITORY_ROOT, "packages", "client", "dist", "index.html");
  if (!fs.existsSync(clientDistPath)) {
    console.error(
      "The client has not been built. Run `npm run build` first — the executable carries the " +
        "interface inside it, and there is nothing to carry yet.",
    );
    process.exit(1);
  }

  console.log("  bundling the server and everything it imports…");
  await bundleServer();

  console.log("  packaging with the Node runtime inside…");
  const manifestPath = writePkgManifest();
  // The ENTRY FILE is passed, with the manifest supplied separately as config.
  // Handing pkg the manifest alone produces an executable that starts, does
  // nothing and exits zero - which is the most confusing failure available, so
  // it is worth stating why this form is used.
  //
  // Invoked through a shell rather than spawned directly: on Windows the npx
  // shim is a batch file, which execFile cannot start.
  execSync(
    `npx pkg "${BUNDLE_PATH}" --config "${manifestPath}" ` +
      `--target ${PKG_TARGET} --output "${EXECUTABLE_PATH}"`,
    { stdio: "inherit", cwd: REPOSITORY_ROOT },
  );

  const sizeInMegabytes = (fs.statSync(EXECUTABLE_PATH).size / BYTES_PER_MEGABYTE).toFixed(1);
  console.log(`\nBuilt ${EXECUTABLE_PATH} (${sizeInMegabytes} MB).`);
  console.log("It needs no Node.js, no npm, and no node_modules beside it.");
}

await main();
