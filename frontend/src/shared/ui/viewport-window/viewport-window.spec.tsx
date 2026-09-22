import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewportWindow } from "./viewport-window";
import { hoverTip } from "@/shared/ui/tooltip/testing";

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
    fireEvent.pointerDown(screen.getByTestId("drag-handle"));
    expect(onMoveStart).toHaveBeenCalledOnce();
    fireEvent.pointerDown(screen.getByTestId("resize-grip"));
    expect(onResizeStart).toHaveBeenCalledOnce();
  });

  it("fills the viewport when expanded — no handle, no grip", () => {
    render(<ViewportWindow title="f.pdf" geometry={null} actions={actions()}><p>body</p></ViewportWindow>);
    const win = screen.getByRole("dialog");
    expect(win.className).toContain("inset-3.5");
    expect(screen.queryByTestId("drag-handle")).toBeNull();
    expect(screen.queryByTestId("resize-grip")).toBeNull();
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
    expect(screen.getByTestId("drag-handle")).toHaveClass("[touch-action:none]", "select-none");
    expect(screen.getByTestId("resize-grip")).toHaveClass("[touch-action:none]", "size-5");
  });

  it("presses its action buttons", () => {
    render(<ViewportWindow title="f.pdf" geometry={GEO} actions={actions()}><p>body</p></ViewportWindow>);
    expect(screen.getByRole("button", { name: "Exit document overlay" })).toHaveClass("active:scale-95", "ease-out");
  });
});

describe("ViewportWindow · drag handle", () => {
  // line-2 is a border token, ~1.6:1 on panel-2; dim reads at ~5:1.
  it("draws its grip in the dim text colour, not a border colour", () => {
    render(
      <ViewportWindow title="f.pdf" geometry={GEO} actions={[]} onMoveStart={vi.fn()}>
        <p>body</p>
      </ViewportWindow>,
    );
    const handle = screen.getByTestId("drag-handle");
    expect(handle).toHaveClass("text-dim");
    expect(handle).not.toHaveClass("text-line-2");
  });

  it("draws its resize corner in the dim colour too", () => {
    render(
      <ViewportWindow title="f.pdf" geometry={GEO} actions={[]} onResizeStart={vi.fn()}>
        <p>body</p>
      </ViewportWindow>,
    );
    const corner = screen.getByTestId("resize-grip").firstElementChild;
    expect(corner).toHaveClass("border-dim");
    expect(corner).not.toHaveClass("border-line-2");
  });
});

describe("ViewportWindow · tooltips", () => {
  it("names each action in a tooltip, not a native title", () => {
    render(<ViewportWindow title="f.pdf" geometry={GEO} actions={actions()}><p>body</p></ViewportWindow>);
    const exit = screen.getByRole("button", { name: "Exit document overlay" });
    expect(exit).not.toHaveAttribute("title");
    expect(hoverTip(exit)).toHaveTextContent("Exit document overlay");
  });

  it("shows an action's short tooltip when it has one, keeping its full name", () => {
    const short = [{ name: "Expand plan-sheet-03.pdf", tooltip: "Expand", icon: "maximize" as const, onClick: vi.fn() }];
    render(<ViewportWindow title="f.pdf" geometry={GEO} actions={short}><p>body</p></ViewportWindow>);
    const expand = screen.getByRole("button", { name: "Expand plan-sheet-03.pdf" });
    expect(hoverTip(expand)?.textContent).toBe("Expand");
  });

  it("explains the drag handle and the resize corner on hover", () => {
    render(
      <ViewportWindow title="f.pdf" geometry={GEO} actions={[]} onMoveStart={vi.fn()} onResizeStart={vi.fn()}>
        <p>body</p>
      </ViewportWindow>,
    );
    const handle = screen.getByTestId("drag-handle");
    const corner = screen.getByTestId("resize-grip");
    expect(handle).not.toHaveAttribute("title");
    expect(corner).not.toHaveAttribute("title");
    expect(hoverTip(handle)).toHaveTextContent("Drag to move");
    fireEvent.pointerLeave(handle, { pointerType: "mouse" });
    expect(hoverTip(corner)).toHaveTextContent("Resize");
  });
});
