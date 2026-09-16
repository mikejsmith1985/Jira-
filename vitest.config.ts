// vitest.config.ts — Test projects for Jira+, one per workspace.
//
// Article V separates three layers. The `core` project holds unit tests: fully
// mocked, no network, no clock, under 10ms each. The `server` project holds
// integration tests, which run against fixtures recorded from the real Jira
// instance — the route Article V prescribes for a third-party system this
// project does not own. The `client` project renders components in jsdom.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "./packages/core",
          environment: "node",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          root: "./packages/server",
          environment: "node",
          include: ["test/**/*.test.js"],
        },
      },
      {
        // The release layer: the checksum module and the installer script that
        // ship inside the zip. The installer test executes the real .vbs under
        // cscript, so it is Windows-only and runs via `npm run test:release`.
        test: {
          name: "release",
          root: "./scripts",
          environment: "node",
          include: ["test/**/*.test.js"],
        },
      },
      {
        test: {
          name: "client",
          root: "./packages/client",
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
          include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
        },
      },
    ],
  },
});
