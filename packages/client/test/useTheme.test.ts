// useTheme.test.ts — Dark by default, and the OS does not get a vote.
//
// The first build defined a complete dark palette and then gated it behind
// `prefers-color-scheme`. The person it was built for runs a light Windows, so
// he opened it every day for a week and never once saw the theme it was designed
// in — then reasonably said he hated how it looked.
//
// So the default is dark, explicitly, and the choice is remembered. The only
// thing worth asserting here is that no code path lets the operating system
// decide again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_THEME, applyTheme, readStoredTheme } from "../src/state/useTheme.js";

/** Replaces localStorage with one whose behaviour the test controls. */
function stubStorage(stored: string | null, doesThrow = false) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => {
        if (doesThrow) throw new Error("access denied");
        return stored;
      },
      setItem: () => undefined,
    },
  });
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => document.documentElement.removeAttribute("data-theme"));

describe("the default", () => {
  it("is dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("is dark on a machine that has never chosen", () => {
    stubStorage(null);

    expect(readStoredTheme()).toBe("dark");
  });

  it("is dark even where the browser refuses storage entirely", () => {
    // A locked-down browser can throw on the ACCESS, not merely return null.
    // Falling over here would take the whole page with it.
    stubStorage(null, true);

    expect(readStoredTheme()).toBe("dark");
  });

  it("does not consult prefers-color-scheme", () => {
    // The regression that produced the complaint. If this ever reads a media
    // query again, somebody's operating system decides what they see.
    const matchMedia = vi.fn();
    stubStorage(null);
    vi.stubGlobal("matchMedia", matchMedia);

    readStoredTheme();

    expect(matchMedia).not.toHaveBeenCalled();
  });
});

describe("a remembered choice", () => {
  it("is honoured when it says light", () => {
    stubStorage("light");

    expect(readStoredTheme()).toBe("light");
  });

  it("falls back to dark for a value that means nothing", () => {
    stubStorage("chartreuse");

    expect(readStoredTheme()).toBe("dark");
  });
});

describe("applying it", () => {
  it("stamps the attribute the stylesheet actually reads", () => {
    applyTheme("light");

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("stamps dark as an explicit value rather than by removing the attribute", () => {
    // The stylesheet's dark theme lives on bare :root, so removing the attribute
    // would also work - but an explicit value keeps the page's state readable
    // in devtools, which is where somebody will look when it goes wrong.
    applyTheme("dark");

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
