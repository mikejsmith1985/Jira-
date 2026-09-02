// SurfaceIcons.tsx — One glyph per surface, drawn rather than installed.
//
// Inline SVG rather than an icon package, for one reason that matters here: this
// application ships as a single executable into an environment with no npm and
// no CDN, and every byte it needs has to already be inside it. Six icons do not
// justify a dependency.
//
// Sized in `em` so they scale with whatever text they sit beside, and stroked at
// 1.75 rather than the usual 2, which reads heavy at this size.

import type { JSX } from "react";

/** Shared geometry, so the six glyphs sit on the same optical baseline. */
const ICON_PROPS = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  style: { flexShrink: 0, verticalAlign: "-0.125em" },
};

/** Query: a magnifier, for the thing you type into. */
export function QueryIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/** Board: columns, which is what a board is. */
export function BoardIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="10" rx="1.5" />
      <rect x="17" y="4" width="4" height="14" rx="1.5" />
    </svg>
  );
}

/** Flow: a rising line, because that is what the charts are. */
export function FlowIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 20h18" />
      <path d="M4 16l5-5 4 3 6-7" />
      <circle cx="19" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Hygiene: a shield, for the checks. */
export function HygieneIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** Changes: a written record, because the journal is append-only. */
export function ChangesIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

/** Setup: the usual gear. */
export function SetupIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

/** Sun, for the light-theme control. */
export function SunIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Moon, for the dark-theme control. */
export function MoonIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}
