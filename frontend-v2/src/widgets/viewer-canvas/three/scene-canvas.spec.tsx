import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Color, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import type { ViewerCanvasProps } from "../ui/props";
import SceneCanvas from "./scene-canvas";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

// The KTX2 capability probe reads a real WebGL context; the test renderer's
// stub has none. It is one of the three exempt setup modules for that reason.
vi.mock("./ktx2-init", () => ({ default: () => null }));

// <Canvas> owns a WebGL context jsdom cannot give it. Replaced by a
// passthrough so its children mount in the test renderer's own scene, with
// the props it was handed captured for the pointer-missed assertions.
const canvas = vi.hoisted(() => ({ props: {} as Record<string, () => void> }));
vi.mock("@react-three/fiber", async (orig) => {
  const real = (await (orig as () => Promise<Record<string, unknown>>)()) as Record<
    string,
    unknown
  >;
  return {
    ...real,
    Canvas: (p: { children: unknown }) => {
      canvas.props = p as unknown as Record<string, () => void>;
      return p.children;
    },
  };
});

const COLORS = { background: "#16181b", grid: "#282c31", accent: "#f97316" };

const props = (over: Partial<ViewerCanvasProps> = {}): ViewerCanvasProps => ({
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
  ...over,
});

const mount = (over: Partial<ViewerCanvasProps> = {}, colors = COLORS) =>
  ReactThreeTestRenderer.create(<SceneCanvas {...props(over)} colors={colors} />);

const ground = (r: Awaited<ReturnType<typeof mount>>) =>
  (r.scene.instance as unknown as Scene).background as Color;

const clickEvent = (point: { x: number; y: number; z: number }) => ({
  nativeEvent: { id: 1 },
  intersections: [{ point }],
  point,
  stopPropagation: vi.fn(),
});

describe("SceneCanvas", () => {
  it("paints the ground and the grid from the theme's tokens, not a hard-coded viewer colour", async () => {
    const r = await mount();
    expect(ground(r).getHexString()).toBe("16181b");
    const grid = r.scene.findAll((n) => n.instance.type === "GridHelper");
    expect(grid).toHaveLength(1);
  });

  it("takes the light theme's ground when the tokens say so", async () => {
    const r = await mount({}, { ...COLORS, background: "#ffffff" });
    expect(ground(r).getHexString()).toBe("ffffff");
  });

  it("deselects on a click into empty space while orbiting", async () => {
    const onPick = vi.fn();
    await mount({ onPick });
    canvas.props.onPointerMissed();
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("leaves the pending point alone on a click into empty space while measuring", async () => {
    const onPick = vi.fn();
    await mount({ mode: "measure", onPick });
    canvas.props.onPointerMissed();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("reports the surface point of a click while measuring", async () => {
    const onMeasurePoint = vi.fn();
    const r = await mount({ mode: "measure", onMeasurePoint });
    const wrapper = r.scene.findAll((n) => n.props.onClick !== undefined)[0];
    await r.fireEvent(wrapper, "click", clickEvent({ x: 1, y: 2, z: 3 }));
    expect(onMeasurePoint).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
  });

  it("reports one point per click, not one per intersection", async () => {
    // R3F dispatches a synthetic event per raycast hit, all sharing one native
    // event; a chain would otherwise gain several points from a single click.
    const onMeasurePoint = vi.fn();
    const r = await mount({ mode: "measure", onMeasurePoint });
    const wrapper = r.scene.findAll((n) => n.props.onClick !== undefined)[0];
    const event = clickEvent({ x: 1, y: 2, z: 3 });
    await r.fireEvent(wrapper, "click", event);
    await r.fireEvent(wrapper, "click", { ...event, stopPropagation: vi.fn() });
    expect(onMeasurePoint).toHaveBeenCalledTimes(1);
  });

  it("picks no points at all while orbiting", async () => {
    const onMeasurePoint = vi.fn();
    const r = await mount({ onMeasurePoint });
    const wrapper = r.scene.findAll((n) => n.props.onClick !== undefined)[0];
    await r.fireEvent(wrapper, "click", clickEvent({ x: 1, y: 2, z: 3 }));
    expect(onMeasurePoint).not.toHaveBeenCalled();
  });
});
