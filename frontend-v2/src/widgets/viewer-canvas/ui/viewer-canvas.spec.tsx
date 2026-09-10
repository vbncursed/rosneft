import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerCanvas } from "./viewer-canvas";
import type { ViewerCanvasProps } from "./props";

const theme = vi.hoisted(() => ({ value: "dark" as "dark" | "light" }));
vi.mock("@/features/theme-toggle", () => ({
  useTheme: () => ({ theme: theme.value, toggle: vi.fn() }),
}));

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
  chains: [],
  activeChainId: null,
  unitRatio: 1,
  resetVersion: 0,
  retryVersion: 0,
  focusRequest: null,
  onPick: vi.fn(),
  onTransformCommit: vi.fn(),
  onMeasurePoint: vi.fn(),
  onCloseActiveChain: vi.fn(),
  onRemoveSegment: vi.fn(),
  onRemoveChain: vi.fn(),
  onLod: vi.fn(),
} as ViewerCanvasProps;

beforeEach(() => {
  seen.colors = [];
  theme.value = "dark";
  document.documentElement.style.setProperty("--panel", "#16181b");
  document.documentElement.style.setProperty("--line", "#282c31");
  document.documentElement.style.setProperty("--accent", "#f97316");
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

  it("re-reads them when the theme flips", () => {
    const { rerender } = render(<ViewerCanvas {...props} />);
    document.documentElement.style.setProperty("--panel", "#ffffff");
    theme.value = "light";
    rerender(<ViewerCanvas {...props} />);
    expect(seen.colors.at(-1)!.background).toBe("#ffffff");
  });
});
