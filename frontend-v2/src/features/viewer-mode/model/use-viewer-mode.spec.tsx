import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useViewerMode } from "./use-viewer-mode";

const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key })); });

describe("useViewerMode", () => {
  it("M toggles measure and drops the selection", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    act(() => result.current.select(4));
    press("m");
    expect(result.current.state).toMatchObject({ mode: "measure", selectedId: null });
    press("M");
    expect(result.current.state.mode).toBe("orbit");
  });

  it("T/R/S change the gizmo only with a selection and the write grant", () => {
    const { result, rerender } = renderHook(
      ({ canWrite }) => useViewerMode({ canWrite, chainOpen: false, onCancelChain: vi.fn() }),
      { initialProps: { canWrite: false } },
    );
    act(() => result.current.select(4));
    press("s");
    expect(result.current.state.gizmo).toBe("translate");
    rerender({ canWrite: true });
    press("s");
    expect(result.current.state.gizmo).toBe("scale");
    act(() => result.current.select(null));
    press("r");
    expect(result.current.state.gizmo).toBe("scale");
  });

  it("G toggles snap", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    press("g");
    expect(result.current.state.snap).toBe(true);
  });

  it("Escape cancels an open chain first, and only then peels the state", () => {
    const onCancelChain = vi.fn();
    const { result, rerender } = renderHook(
      ({ chainOpen }) => useViewerMode({ canWrite: true, chainOpen, onCancelChain }),
      { initialProps: { chainOpen: true } },
    );
    act(() => result.current.toggleMeasure());
    press("Escape");
    expect(onCancelChain).toHaveBeenCalledOnce();
    expect(result.current.state.mode).toBe("measure");
    rerender({ chainOpen: false });
    press("Escape");
    expect(result.current.state.mode).toBe("orbit");
  });

  it("exposes the rest of the reducer as callbacks: place mode, the gizmo and leaving measure", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    act(() => result.current.enterPlace());
    expect(result.current.state.mode).toBe("place");
    act(() => result.current.exitPlace());
    expect(result.current.state.mode).toBe("orbit");
    act(() => result.current.setGizmo("rotate"));
    expect(result.current.state.gizmo).toBe("rotate");
    act(() => result.current.toggleMeasure());
    act(() => result.current.exitMeasure());
    expect(result.current.state.mode).toBe("orbit");
  });

  it("ignores keys typed into a field", () => {
    const { result } = renderHook(() => useViewerMode({ canWrite: true, chainOpen: false, onCancelChain: vi.fn() }));
    const input = document.createElement("input");
    document.body.append(input);
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true })); });
    expect(result.current.state.mode).toBe("orbit");
    input.remove();
  });
});
