import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelCanvas } from "./model-canvas";

// Recorded stand-in for the scene: the props it got, how often it drew, and an
// optional throw standing in for a Canvas that could not start.
const seen = vi.hoisted(() => ({ props: null as Record<string, unknown> | null, renders: 0, throwOnRender: false }));
vi.mock("../three/model-scene", () => ({
  default: (props: Record<string, unknown>) => {
    seen.renders += 1;
    seen.props = props;
    if (seen.throwOnRender) throw new Error("no webgl");
    return <p>scene</p>;
  },
}));

const props = () => ({ lods: [], retryVersion: 0, onLod: vi.fn(), onUnavailable: vi.fn() });

beforeEach(() => {
  seen.props = null;
  seen.renders = 0;
  seen.throwOnRender = false;
});

describe("ModelCanvas", () => {
  it("passes the lods, the retry version and the theme colours to the scene", () => {
    const lods = [{ lod: 0, hash: "h0", size: 1 }];
    const { container } = render(<ModelCanvas {...props()} lods={lods} retryVersion={2} />);
    expect(container).toHaveTextContent("scene");
    expect(seen.props).toMatchObject({ lods, retryVersion: 2 });
    expect(seen.props?.colors).toEqual(expect.objectContaining({ background: expect.any(String) }));
  });

  it("hands onUnavailable to the scene, for a lost context", () => {
    const onUnavailable = vi.fn();
    render(<ModelCanvas {...props()} onUnavailable={onUnavailable} />);
    expect(seen.props?.onUnavailable).toBe(onUnavailable);
  });

  it("reports unavailable once and draws nothing when the scene throws", () => {
    seen.throwOnRender = true;
    const onUnavailable = vi.fn();
    // React logs every caught error; the boundary catching it is the point.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<ModelCanvas {...props()} onUnavailable={onUnavailable} />);
    quiet.mockRestore();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not redraw the scene on a page re-render with the same props", () => {
    const same = props();
    const { rerender } = render(<ModelCanvas {...same} />);
    const drawn = seen.renders;
    rerender(<ModelCanvas {...same} />);
    expect(seen.renders).toBe(drawn);
  });
});
