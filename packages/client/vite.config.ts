// vite.config.ts — Dev server and production build for the Jira+ client.
//
// The dev server proxies /jira-proxy and /api to the local Express host, so the
// browser talks to the same origin it will in production and the credential
// stays server-side even in development.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Where the local Express host listens during development. */
const LOCAL_SERVER_ORIGIN = "http://localhost:5555";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/jira-proxy": LOCAL_SERVER_ORIGIN,
      "/api": LOCAL_SERVER_ORIGIN,
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
