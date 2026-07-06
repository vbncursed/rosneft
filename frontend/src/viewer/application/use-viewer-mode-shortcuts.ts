import { useCallback } from "react";
import { useCan } from "@/auth/presentation/current-user-context";
import { usePanoramaDrag } from "@/panorama/application/use-panorama-drag";
import { useKeyboardShortcuts } from "@/viewer/application/use-keyboard-shortcuts";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type { Vec3 } from "@/shared/domain/vec3";

interface ViewerModeParams {
  setSelectedId: (id: number | null) => void;
  setMode: (mode: GizmoMode) => void;
  measureMode: boolean;
  activeChainId: number | null;
  toggleMeasure: () => void;
  exitMeasure: () => void;
  cancelChain: () => void;
  toggleSnap: () => void;
  cyclePanorama: () => void;
  onCommitPanorama: (id: number, position: Vec3) => void;
}

// useViewerModeShortcuts owns the mutually-exclusive scene interaction modes
// (placement gizmo, measure, panorama "Move") and their keyboard bindings,
// keeping ModelViewer focused on composition. Move mode is gated on
// panorama:write so the V hotkey can't bypass the permission-gated button.
export function useViewerModeShortcuts(params: ViewerModeParams) {
  const {
    setSelectedId,
    setMode,
    measureMode,
    activeChainId,
    toggleMeasure,
    exitMeasure,
    cancelChain,
    toggleSnap,
    cyclePanorama,
    onCommitPanorama,
  } = params;

  const canMovePanorama = useCan()("panorama:write");
  const panoramaDrag = usePanoramaDrag(onCommitPanorama);

  // Entering measure drops the gizmo target (so a stray drag can't move a
  // placement) and exits Move mode.
  const handleToggleMeasure = useCallback(() => {
    if (!measureMode) {
      setSelectedId(null);
      panoramaDrag.exit();
    }
    toggleMeasure();
  }, [measureMode, setSelectedId, panoramaDrag, toggleMeasure]);

  // Entering Move exits measure and drops any gizmo selection so the modes
  // never fight.
  const handleToggleMove = useCallback(() => {
    if (!canMovePanorama) return;
    if (!panoramaDrag.moveMode) {
      exitMeasure();
      setSelectedId(null);
    }
    panoramaDrag.toggle();
  }, [canMovePanorama, panoramaDrag, exitMeasure, setSelectedId]);

  // Esc layered: Move exits first, then an open chain breaks, then the next
  // press exits measure mode (and deselects any placement).
  const handleEscape = useCallback(() => {
    if (panoramaDrag.moveMode) {
      panoramaDrag.exit();
      return;
    }
    if (measureMode && activeChainId != null) {
      cancelChain();
      return;
    }
    setSelectedId(null);
    exitMeasure();
  }, [
    panoramaDrag,
    measureMode,
    activeChainId,
    cancelChain,
    setSelectedId,
    exitMeasure,
  ]);

  useKeyboardShortcuts({
    Escape: handleEscape,
    m: handleToggleMeasure,
    t: () => setMode("translate"),
    r: () => setMode("rotate"),
    s: () => setMode("scale"),
    g: toggleSnap,
    p: cyclePanorama,
    v: handleToggleMove,
  });

  return { handleToggleMeasure, handleToggleMove, panoramaDrag };
}
