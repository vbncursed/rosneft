import { Component, type ReactNode } from "react";

interface PanoramaErrorBoundaryProps {
  // The panorama whose sphere this guards — reported back on failure so
  // the UI can flag exactly which capture is broken.
  panoramaId: number;
  onError: (id: number) => void;
  children: ReactNode;
}

interface PanoramaErrorBoundaryState {
  hasError: boolean;
}

// PanoramaErrorBoundary contains a failed equirect texture load (e.g. a
// non-image blob uploaded by mistake) so one bad panorama renders nothing
// instead of throwing an uncaught error that loses the WebGL context and
// blanks the entire scene. Lives inside the R3F Canvas; its fallback is
// `null` because there is no meaningful 3D placeholder for a missing sky.
//
// The parent re-keys this on the active panorama id, so switching to a
// different (valid) panorama remounts a fresh boundary.
export default class PanoramaErrorBoundary extends Component<
  PanoramaErrorBoundaryProps,
  PanoramaErrorBoundaryState
> {
  state: PanoramaErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PanoramaErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onError(this.props.panoramaId);
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
