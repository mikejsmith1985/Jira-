// SurfaceBoundary.test.tsx — A broken panel costs a panel, not a screen.
//
// A stored configuration written before a field existed left one panel mapping
// over an absence, and React unmounted the ENTIRE Setup screen. The symptom was
// a blank page: no message, nothing to act on, and no way to reach the
// connection settings that would have fixed it.
//
// The specific cause is fixed at the source. This is so the next one costs less,
// and so the message names WHICH panel — "something went wrong" is not something
// anybody can act on.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SurfaceBoundary } from "../src/components/SurfaceBoundary.js";

afterEach(cleanup);

/** A component that fails the way the template panel did. */
function Exploding(): never {
  throw new Error("Cannot read properties of undefined (reading 'map')");
}

/** React logs a caught error itself; silenced so the run stays readable. */
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("when a panel renders normally", () => {
  it("shows it, and adds nothing of its own", () => {
    render(
      <SurfaceBoundary name="relay">
        <p>All fine here.</p>
      </SurfaceBoundary>,
    );

    expect(screen.getByText("All fine here.")).toBeTruthy();
  });
});

describe("when a panel fails", () => {
  it("names which one, so a report is actionable", () => {
    render(
      <SurfaceBoundary name="description template">
        <Exploding />
      </SurfaceBoundary>,
    );

    expect(screen.getByText(/description template panel could not be shown/i)).toBeTruthy();
  });

  it("says the rest of the screen still works", () => {
    // The blank page gave no reason to believe anything still worked.
    render(
      <SurfaceBoundary name="relay">
        <Exploding />
      </SurfaceBoundary>,
    );

    expect(screen.getByText(/everything else on this screen still works/i)).toBeTruthy();
  });

  it("carries the actual reason rather than a generic apology", () => {
    render(
      <SurfaceBoundary name="relay">
        <Exploding />
      </SurfaceBoundary>,
    );

    expect(screen.getByText(/reading 'map'/)).toBeTruthy();
  });

  it("does not take its siblings with it", () => {
    // The whole point. One panel failing left nothing on screen at all.
    render(
      <div>
        <SurfaceBoundary name="relay">
          <Exploding />
        </SurfaceBoundary>
        <p>The connection panel is still here.</p>
      </div>,
    );

    expect(screen.getByText("The connection panel is still here.")).toBeTruthy();
  });
});
