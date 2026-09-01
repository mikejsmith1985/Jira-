// main.tsx — Mounts the application.
//
// TanStack Query owns server state: fetch lifecycle, caching, retries and
// in-flight status. The predecessor hand-rolled that in every hook, which is
// exactly the rebuilding the Framework-First gate exists to stop.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App.js";
import "./styles/tokens.css";
import "./styles/app.css";

/** A retrieval is deliberate and expensive, so nothing refetches behind the user's back. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: Infinity },
  },
});

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("The page has no #root element to mount into.");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
