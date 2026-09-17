import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewportWindow } from "./viewport-window";

const GEO = { x: 10, y: 20, w: 560, h: 400 };
const actions = (onClick = vi.fn()) => [{ name: "Exit document overlay", icon: "minus" as const, onClick }];

describe("ViewportWindow", () => {
  it("is a named dialog placed by its geometry, with the drag handle and the resize grip", () => {
    const onMoveStart = vi.fn();
    const onResizeStart = vi.fn();
    render(
      <ViewportWindow title="plan-sheet-03.pdf" geometry={GEO} actions={actions()} onMoveStart={onMoveStart} onResizeStart={onResizeStart}>
        <p>body</p>
      </ViewportWindow>,
    );
    const win = screen.getByRole("dialog", { name: "plan-sheet-03.pdf" });
    expect(win.style.left).toBe("10px");
    expect(win.style.width).toBe("560px");
    fireEvent.pointerDown(screen.getByTitle("Drag to move"));
    expect(onMoveStart).toHaveBeenCalledOnce();
    fireEvent.pointerDown(screen.getByTitle("Resize"));
    expect(onResizeStart).toHaveBeenCalledOnce();
  });

  it("fills the viewport when expanded — no handle, no grip", () => {
    render(<ViewportWindow title="f.pdf" geometry={null} actions={actions()}><p>body</p></ViewportWindow>);
    const win = screen.getByRole("dialog");
    expect(win.className).toContain("inset-3.5");
    expect(screen.queryByTitle("Drag to move")).toBeNull();
    expect(screen.queryByTitle("Resize")).toBeNull();
  });

  it("draws every action as a named icon button, bad ones in the bad tone", () => {
    const onClick = vi.fn();
    render(
      <ViewportWindow title="f.pdf" geometry={GEO} actions={[{ name: "Delete f.pdf", icon: "trash", tone: "bad", onClick }]}>
        <p>body</p>
      </ViewportWindow>,
    );
    const btn = screen.getByRole("button", { name: "Delete f.pdf" });
    expect(btn.className).toContain("border-bad");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shields the body while dragging", () => {
    const { rerender } = render(<ViewportWindow title="f.pdf" geometry={GEO} actions={[]}><p>body</p></ViewportWindow>);
    expect(screen.queryByTestId("drag-shield")).toBeNull();
    rerender(<ViewportWindow title="f.pdf" geometry={GEO} actions={[]} dragging><p>body</p></ViewportWindow>);
    expect(screen.getByTestId("drag-shield")).toBeInTheDocument();
  });

  it("keeps the grabbing cursor over the whole window while a drag runs", () => {
    const { rerender } = render(<ViewportWindow title="f.pdf" geometry={GEO} actions={[]}><p>body</p></ViewportWindow>);
    expect(screen.getByRole("dialog")).not.toHaveClass("cursor-grabbing");
    rerender(<ViewportWindow title="f.pdf" geometry={GEO} actions={[]} dragging><p>body</p></ViewportWindow>);
    expect(screen.getByRole("dialog")).toHaveClass("cursor-grabbing");
  });

  it("claims touch for its handle and grip, and gives the grip a finger-sized target", () => {
    render(
      <ViewportWindow title="f.pdf" geometry={GEO} actions={[]} onMoveStart={vi.fn()} onResizeStart={vi.fn()}>
        <p>body</p>
      </ViewportWindow>,
    );
    expect(screen.getByTitle("Drag to move")).toHaveClass("[touch-action:none]", "select-none");
    expect(screen.getByTitle("Resize")).toHaveClass("[touch-action:none]", "size-5");
  });

  it("presses its action buttons", () => {
    render(<ViewportWindow title="f.pdf" geometry={GEO} actions={actions()}><p>body</p></ViewportWindow>);
    expect(screen.getByRole("button", { name: "Exit document overlay" })).toHaveClass("active:scale-95", "ease-out");
  });
});
