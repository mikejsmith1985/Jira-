// useTheme.ts — Dark by default, and remembered.
//
// The first build let the operating system decide, so the person it was built
// for opened it on a light Windows and never once saw the theme it was designed
// in. Dark is now the default and the choice is explicit; the OS is not asked.
//
// The attribute is written to <html> before React mounts (see main.tsx) so the
// page never paints one theme and then flips to the other.

import { useCallback, useEffect, useState } from "react";

/** Where the choice is remembered between launches. */
const STORAGE_KEY = "jiraplus-theme";

/** The two themes. There is no "system": the OS is not asked. */
export type ThemeName = "dark" | "light";

/** Dark unless somebody has said otherwise. */
export const DEFAULT_THEME: ThemeName = "dark";

/**
 * Reads the remembered theme.
 *
 * Storage can throw outright in a locked-down browser, so a failure falls back
 * to the default rather than taking the page down with it.
 */
export function readStoredTheme(): ThemeName {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Stamps the theme where the stylesheet can see it. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/** What the shell needs to render and change the theme. */
export interface ThemeState {
  readonly theme: ThemeName;
  readonly setTheme: (next: ThemeName) => void;
}

/** The theme, held for the session and remembered beyond it. */
export function useTheme(): ThemeState {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembering it is a smaller problem than not applying it.
    }
  }, []);

  return { theme, setTheme };
}
