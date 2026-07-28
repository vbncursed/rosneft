// Run with: yarn test:spa  (vitest + jsdom).
//
// Guards the positioning contract of the panorama loading cover. The bug this
// replaces: drei's `fullscreen` anchors to the projected screen position of the
// Html group (the world origin) and offsets by half the canvas, so the cover
// only lined up when the origin projected to the exact canvas centre. With a
// model that <Bounds fit> frames off-origin, it slid sideways and left the
// viewer UI visible along the top and left edges.
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const SIZE = { width: 1600, height: 900 };
let htmlProps: Record<string, unknown> = {};

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (s: { size: typeof SIZE }) => unknown) => selector({ size: SIZE }),
}));
vi.mock("@react-three/drei", () => ({
  Html: (props: Record<string, unknown>) => {
    htmlProps = props;
    return null;
  },
}));

const { renderComponent } = await import("@/test-support/render-hook");
const { default: PanoramaLoadingOverlay } = await import("./panorama-loading-overlay");

beforeEach(() => {
  htmlProps = {};
});

function mount(progress: number | null = 50) {
  const h = renderComponent(<PanoramaLoadingOverlay progress={progress} />);
  h.unmount();
}

test("does not use drei's fullscreen — it is anchored to the camera, not the canvas", () => {
  mount();
  assert.equal(htmlProps.fullscreen, undefined);
});

test("pins the cover to the canvas top-left regardless of where the camera looks", () => {
  mount();
  const calc = htmlProps.calculatePosition as () => [number, number];
  assert.equal(typeof calc, "function");
  assert.deepEqual(calc(), [0, 0]);
});

test("sizes the cover to the canvas so it covers every edge", () => {
  mount();
  assert.deepEqual(htmlProps.style, { width: SIZE.width, height: SIZE.height });
});

test("the anchor is a stable reference — a new function each render remounts the portal", () => {
  mount();
  const first = htmlProps.calculatePosition;
  mount();
  assert.equal(htmlProps.calculatePosition, first);
});
