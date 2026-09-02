// SurfaceIcons.test.tsx — Six glyphs that must not become a dependency.
//
// These are drawn rather than installed for one reason that matters here: Jira+
// ships as a single executable into an environment with no npm and no CDN, so
// everything it needs has to already be inside it. Six icons do not justify a
// package, and a package that fails to load leaves navigation unlabelled.
//
// What is asserted is only what would actually break: that they scale with their
// text, that they are hidden from screen readers (the label beside them is the
// accessible name), and that they take their colour from the thing they sit in
// rather than carrying one of their own.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  BoardIcon,
  ChangesIcon,
  FlowIcon,
  HygieneIcon,
  MoonIcon,
  QueryIcon,
  SetupIcon,
  SunIcon,
} from "../src/components/SurfaceIcons.js";

afterEach(cleanup);

/** Every glyph, so a new one cannot skip these rules by being added later. */
const ICONS = [
  ["query", QueryIcon],
  ["board", BoardIcon],
  ["flow", FlowIcon],
  ["hygiene", HygieneIcon],
  ["changes", ChangesIcon],
  ["setup", SetupIcon],
  ["sun", SunIcon],
  ["moon", MoonIcon],
] as const;

describe.each(ICONS)("the %s icon", (unusedName, Icon) => {
  it("is sized in em, so it scales with the text beside it", () => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("1em");
    expect(svg?.getAttribute("height")).toBe("1em");
  });

  it("is hidden from screen readers, because the label carries the meaning", () => {
    // A glyph announced beside its own label reads the name twice.
    const { container } = render(<Icon />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("takes its colour from its surroundings", () => {
    // An icon with a colour of its own goes wrong the moment the theme changes,
    // and this interface has two themes.
    const { container } = render(<Icon />);

    expect(container.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
  });

  it("draws something", () => {
    const { container } = render(<Icon />);

    expect(container.querySelector("svg")?.childElementCount).toBeGreaterThan(0);
  });
});
