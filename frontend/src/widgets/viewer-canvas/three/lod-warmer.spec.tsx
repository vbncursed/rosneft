import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LodWarmer from "./lod-warmer";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

describe("LodWarmer", () => {
  it("reports the level ready once per url, not once per re-render", () => {
    const onReady = vi.fn();
    const { rerender } = render(<LodWarmer url="/a.glb" onReady={onReady} />);
    rerender(<LodWarmer url="/a.glb" onReady={() => onReady()} />);
    expect(onReady).toHaveBeenCalledTimes(1);

    rerender(<LodWarmer url="/b.glb" onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it("stays on the coarse level when the warm one throws", async () => {
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockImplementation(() => {
      throw new Error("transcoder failed");
    });
    // React re-reports every caught error to console and to window; the
    // boundary having caught it is exactly what this asserts.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", swallow);

    // No throw reaches the caller, and nothing renders — the coarse level
    // already on screen above us stays.
    const { container } = render(<LodWarmer url="/c.glb" onReady={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    window.removeEventListener("error", swallow);
    quiet.mockRestore();
    vi.mocked(drei.useGLTF).mockReset();
  });
});
