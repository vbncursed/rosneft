import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContextLossWatch from "./context-loss-watch";

// The renderer's canvas stands in for R3F's gl.domElement: a real element the
// listener can attach to, reached through the same useThree selector.
const gl = vi.hoisted(() => ({ domElement: null as unknown as HTMLCanvasElement }));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { gl: unknown }) => unknown) => selector({ gl }),
}));

const lose = (canvas: HTMLCanvasElement) => {
  const event = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  gl.domElement = document.createElement("canvas");
});

describe("ContextLossWatch", () => {
  it("reports a lost context exactly once and prevents the default", () => {
    const onLost = vi.fn();
    render(<ContextLossWatch onLost={onLost} />);
    const event = lose(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("stops listening once unmounted", () => {
    const onLost = vi.fn();
    const { unmount } = render(<ContextLossWatch onLost={onLost} />);
    unmount();
    lose(gl.domElement);
    expect(onLost).not.toHaveBeenCalled();
  });
});
