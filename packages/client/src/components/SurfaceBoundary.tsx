// SurfaceBoundary.tsx — One broken panel must not take a screen with it.
//
// A stored configuration written before a field existed left one panel mapping
// over an absence, and React unmounted the ENTIRE Setup screen. The symptom was
// a blank page: no message, nothing in the interface to act on, and no way to
// reach the connection settings that would have fixed it.
//
// The specific cause is fixed at the source. This exists so the next one costs a
// panel rather than a screen — and so the message names which panel, because
// "something went wrong" is not something anybody can act on.

import { Component } from "react";
import type { ErrorInfo, JSX, ReactNode } from "react";

/** What the boundary needs. */
export interface SurfaceBoundaryProps {
  /** Named in the message, so a report says which part failed. */
  readonly name: string;
  readonly children: ReactNode;
}

/** What it is currently showing. */
interface SurfaceBoundaryState {
  readonly failure: Error | null;
}

/** Catches a render failure in one part of a screen. */
export class SurfaceBoundary extends Component<SurfaceBoundaryProps, SurfaceBoundaryState> {
  public override state: SurfaceBoundaryState = { failure: null };

  /** React's hook for turning a thrown error into state. */
  public static getDerivedStateFromError(failure: Error): SurfaceBoundaryState {
    return { failure };
  }

  /** Logs it, so the console carries the stack the panel cannot show. */
  public override componentDidCatch(failure: Error, info: ErrorInfo): void {
    // The stack has nowhere else to go, and a failure nobody can diagnose is
    // worse than a noisy console.
    console.error(`Jira+ — the ${this.props.name} panel failed to render.`, failure, info);
  }

  public override render(): ReactNode {
    const { failure } = this.state;
    if (failure === null) return this.props.children;

    return (
      <p className="notice notice--error">
        <strong>The {this.props.name} panel could not be shown.</strong> Everything else on this
        screen still works. The reason was: {failure.message}
      </p>
    ) as JSX.Element;
  }
}
