import { render, renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "@/features/theme-toggle";
import { ViewerCanvas } from "./viewer-canvas";
import type { ViewerCanvasProps } from "./props";

const seen = vi.hoisted(() => ({ colors: [] as { background: string }[] }));
vi.mock("../three/scene-canvas", () => ({
  default: ({ colors }: { colors: { background: string } }) => {
    seen.colors.push(colors);
    return null;
  },
}));

const props = {
  slug: "t",
  parentLods: [],
  targetLod: 0,
  placements: [],
  mode: "orbit",
  selectedId: null,
  gizmo: "translate",
  snap: false,
  canWrite: false,
  canEditMeasurements: false,
  chains: [],
  activeChainId: null,
  unitRatio: 1,
  resetVersion: 0,
  playing: false,
  retryVersion: 0,
  focusRequest: null,
  activePanorama: null,
  calibrationGhost: null,
  panoramaBitmap: null,
  panoramaStatus: "idle",
  panoramaProgress: null,
  panoramaOpacity: 1,
  calibrating: false,
  panoramas: [],
  showMarkers: true,
  showMeasurements: true,
  markerLabels: {},
  move: { active: false, draggingId: null, livePos: null },
  cameraPositionRef: { current: null },
  cameraYawRef: { current: null },
  onPick: vi.fn(),
  onActivatePanorama: vi.fn(),
  onMarkerGrab: vi.fn(),
  onMarkerMove: vi.fn(),
  onMarkerDrop: vi.fn(),
  onTransformCommit: vi.fn(),
  onMeasurePoint: vi.fn(),
  onCloseActiveChain: vi.fn(),
  onRemoveSegment: vi.fn(),
  onRemoveChain: vi.fn(),
  onLod: vi.fn(),
  onPlayStop: vi.fn(),
} as ViewerCanvasProps;

const setTokens = (panel: string) => {
  document.documentElement.style.setProperty("--panel", panel);
  document.documentElement.style.setProperty("--line", "#282c31");
  document.documentElement.style.setProperty("--accent", "#f97316");
};

beforeEach(() => {
  seen.colors = [];
  setTokens("#16181b");
});

describe("ViewerCanvas", () => {
  it("hands the scene the colours the tokens hold — three takes no CSS variables", () => {
    render(<ViewerCanvas {...props} />);
    expect(seen.colors[0]).toEqual({
      background: "#16181b",
      grid: "#282c31",
      accent: "#f97316",
    });
  });

  it("re-reads them when someone else flips the theme", () => {
    // The real hook, and the toggle a different component would press: the
    // sidebar's ThemeToggle and this canvas are never rendered together, so a
    // theme that lived in component state would leave the scene on the old
    // ground for as long as it stayed mounted.
    render(<ViewerCanvas {...props} />);
    const elsewhere = renderHook(() => useTheme());

    setTokens("#ffffff");
    act(() => elsewhere.result.current.toggle());

    expect(seen.colors.at(-1)!.background).toBe("#ffffff");
  });

  it("does not re-render the scene when the page re-renders with the same props", () => {
    // The page re-renders on every panel fold and search keystroke; the scene
    // below is three.js, and each render of it reconciles the whole graph.
    const { rerender } = render(<ViewerCanvas {...props} />);
    const renders = seen.colors.length;
    rerender(<ViewerCanvas {...props} />);
    expect(seen.colors).toHaveLength(renders);
    rerender(<ViewerCanvas {...props} selectedId={4} />);
    expect(seen.colors).toHaveLength(renders + 1);
  });
});
