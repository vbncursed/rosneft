"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError: (err: unknown) => void;
  // Bumping resetKey re-arms the boundary after an upstream switch to
  // a different LOD URL, so a recovered chain can render again.
  resetKey: string;
}

interface State {
  failed: boolean;
}

// LodErrorBoundary catches a thrown render from useGLTF (network 5xx,
// malformed Draco/KTX2, transcoder failure, …) and notifies the parent
// so it can advance to the next LOD in the fallback chain. Without the
// boundary a single broken artifact would tear down the whole canvas.
//
// The boundary renders null while in the failed state. The parent is
// expected to react to onError by swapping the active URL (and bumping
// resetKey), which clears the failed state and lets the fresh subtree
// mount. Class component because React's ErrorBoundary contract is
// still class-only; no third-party dependency.
export default class LodErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
