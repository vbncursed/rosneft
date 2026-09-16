// Guards the positioning contract of the panorama loading cover. The bug this
// replaces: drei's `fullscreen` anchors to the projected screen position of the
// Html group (the world origin) and offsets by half the canvas, so the cover
// only lined up when the origin projected to the exact canvas centre. With a
// model that <Bounds fit> frames off-origin, it slid sideways and left the
// viewer UI visible along the top and left edges.
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIZE = { width: 1600, height: 900 };
let htmlProps: Record<string, unknown> = {};

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (s: { size: typeof SIZE }) => unknown) => selector({ size: SIZE }),
}));
vi.mock("@react-three/drei", () => ({
  Html: (props: { children?: ReactNode }) => {
    htmlProps = props;
    return props.children;
  },
}));

const { default: PanoramaLoadingOverlay } = await import("./panorama-loading-overlay");

beforeEach(() => {
  htmlProps = {};
});

const mount = (progress: number | null = 50, leaving = false, onLeft = vi.fn()) =>
  render(<PanoramaLoadingOverlay progress={progress} leaving={leaving} onLeft={onLeft} />);

describe("PanoramaLoadingOverlay", () => {
  it("does not use drei's fullscreen — it is anchored to the camera, not the canvas", () => {
    mount();
    expect(htmlProps.fullscreen).toBeUndefined();
  });

  it("pins the cover to the canvas top-left regardless of where the camera looks", () => {
    mount();
    const calc = htmlProps.calculatePosition as () => [number, number];
    expect(calc).toBeTypeOf("function");
    expect(calc()).toEqual([0, 0]);
  });

  it("sizes the cover to the canvas so it covers every edge", () => {
    mount();
    expect(htmlProps.style).toEqual({ width: SIZE.width, height: SIZE.height });
  });

  it("the anchor is a stable reference — a new function each render remounts the portal", () => {
    mount().unmount();
    const first = htmlProps.calculatePosition;
    mount();
    expect(htmlProps.calculatePosition).toBe(first);
  });

  it("covers the scene in panel, not in a hole the viewer shows through", () => {
    const { container } = mount();
    expect(container.firstElementChild?.className).toContain("bg-panel");
  });

  it("reports the download percent", () => {
    mount(40);
    expect(screen.getByRole("progressbar", { name: "Loading panorama" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
  });

  it("runs indeterminate when the server sent no Content-Length", () => {
    mount(null);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  describe("fading", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fades in on mount", () => {
      const { container } = mount();
      expect(container.firstElementChild).toHaveClass(
        "transition-opacity",
        "duration-150",
        "ease-out",
        "starting:opacity-0",
        "motion-reduce:duration-100",
      );
    });

    it("fades out once the photo is ready, lets clicks through, then reports it has gone", () => {
      vi.useFakeTimers();
      const onLeft = vi.fn();
      const { container } = mount(100, true, onLeft);
      expect(container.firstElementChild).toHaveClass("opacity-0", "pointer-events-none", "duration-200");
      act(() => vi.advanceTimersByTime(199));
      expect(onLeft).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onLeft).toHaveBeenCalledTimes(1);
    });

    it("stays while the download is still running", () => {
      vi.useFakeTimers();
      const onLeft = vi.fn();
      mount(40, false, onLeft);
      act(() => vi.advanceTimersByTime(1000));
      expect(onLeft).not.toHaveBeenCalled();
    });
  });
});
