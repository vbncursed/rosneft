import ReactThreeTestRenderer from "@react-three/test-renderer";
import { createElement, type ComponentType } from "react";
import type { Color, Scene } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ModelScene from "./model-scene";
import { eventually } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

// The KTX2 capability probe reads a real WebGL context the test renderer does not have.
vi.mock("./ktx2-init", () => ({ default: () => null }));

// <Canvas> owns a WebGL context jsdom cannot give it: children mount in the test renderer's scene.
vi.mock("@react-three/fiber", async (orig) => {
  const real = await (orig as () => Promise<Record<string, unknown>>)();
  return {
    ...real,
    Canvas: (p: { children: unknown }) => p.children,
  };
});

// Recorded-and-forwarded: the GltfModel props decide behaviour without leaving a trace in the scene graph.
const seen = vi.hoisted(() => ({ gltf: {} as Record<string, unknown> }));
vi.mock("./gltf-model", async (orig) => {
  const real = (await orig<{ default: ComponentType<Record<string, unknown>> }>()).default;
  return {
    default: (p: Record<string, unknown>) => {
      seen.gltf = p;
      return createElement(real, p);
    },
  };
});

const COLORS = { background: "#16181b", grid: "#282c31", accent: "#f97316" };
const LODS = [{ lod: 0, hash: "h0", size: 1 }];

const props = (over: Partial<Parameters<typeof ModelScene>[0]> = {}) => ({
  lods: LODS,
  retryVersion: 0,
  onLod: vi.fn(),
  colors: COLORS,
  onUnavailable: vi.fn(),
  ...over,
});

const mount = (over: Partial<Parameters<typeof ModelScene>[0]> = {}) =>
  ReactThreeTestRenderer.create(createElement(ModelScene, props(over)));

beforeEach(() => {
  seen.gltf = {};
});

describe("ModelScene", () => {
  it("drives GltfModel on Auto LOD with the raycast off and the page's lods", async () => {
    const r = await mount();
    expect(seen.gltf).toMatchObject({ targetLod: "auto", raycastable: false, lods: LODS, retryVersion: 0 });
    await r.unmount();
  });

  it("draws the grid and the background from the colours passed in", async () => {
    const r = await mount();
    expect(r.scene.findAll((n) => n.instance.type === "GridHelper")).toHaveLength(1);
    expect(((r.scene.instance as unknown as Scene).background as Color).getHexString()).toBe("16181b");
    await r.unmount();
  });

  it("reports the LOD state from GltfModel to the page", async () => {
    const onLod = vi.fn();
    const r = await mount({ onLod });
    await eventually(() => expect(onLod).toHaveBeenCalled());
    await r.unmount();
  });

  it("passes a bumped retryVersion down to GltfModel", async () => {
    const r = await mount();
    await r.update(createElement(ModelScene, props({ retryVersion: 1 })));
    expect(seen.gltf).toMatchObject({ retryVersion: 1 });
    await r.unmount();
  });
});
