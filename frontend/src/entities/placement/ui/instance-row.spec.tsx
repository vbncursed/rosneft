import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstanceRow } from "./instance-row";

const group = { model: { slug: "tank", title: "storage-tank-500" }, instances: [{ id: 2, index: 2, label: "Tank 2" }] };
const instance = group.instances[0];
const handlers = () => ({ onSelect: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onFocus: vi.fn() });

describe("InstanceRow", () => {
  it("selects by its name and reports the pressed state", async () => {
    const h = handlers();
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...h} />);
    // The name carries the visible text (WCAG 2.5.3): `#2 · Tank 2` is in it.
    const select = screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" });
    await userEvent.click(select);
    expect(h.onSelect).toHaveBeenCalledWith(2);
    expect(select).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("#2 · Tank 2")).toBeInTheDocument();
  });
  it("offers Rename and Delete by grant, named after the instance", async () => {
    const h = handlers();
    render(<InstanceRow group={group} instance={instance} selected pending={false} canWrite canDelete {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename storage-tank-500 #2" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete storage-tank-500 #2" }));
    expect(h.onRename).toHaveBeenCalledWith(2);
    expect(h.onDelete).toHaveBeenCalledWith(2);
  });
  it("hides Delete without the delete grant, and both without write", () => {
    const { rerender } = render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete={false} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Rename/ })).toBeInTheDocument();
    rerender(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite={false} canDelete={false} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /^Rename/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Focus storage-tank-500 #2" })).toBeInTheDocument();
  });
  it("a reader with neither grant can still put the camera on it", async () => {
    const h = handlers();
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite={false} canDelete={false} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Focus storage-tank-500 #2" }));
    expect(h.onFocus).toHaveBeenCalledWith(2);
  });
  it("waits while a mutation is in flight", () => {
    render(<InstanceRow group={group} instance={instance} selected pending canWrite canDelete {...handlers()} />);
    expect(screen.getByRole("button", { name: "Delete storage-tank-500 #2" })).toBeDisabled();
  });

  it("presses its buttons, and repaints a selection without a tween", () => {
    render(<InstanceRow group={group} instance={instance} selected pending={false} canWrite canDelete {...handlers()} />);
    expect(screen.getByRole("button", { name: "Rename storage-tank-500 #2" })).toHaveClass("enabled:active:scale-95");
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" })).toHaveClass("active:scale-[0.97]");
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" }).parentElement!.className).not.toMatch(/transition/);
  });
  it("presses Focus", () => {
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite={false} canDelete={false} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Focus storage-tank-500 #2" })).toHaveClass("active:scale-[0.97]", "ease-out");
  });
});

/** A mouse resting on the control for the tooltip's 500 ms; returns what opened. */
function hoverTip(el: Element) {
  vi.useFakeTimers();
  fireEvent.pointerEnter(el, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(500));
  vi.useRealTimers();
  return screen.queryByRole("tooltip");
}

describe("InstanceRow · tooltip", () => {
  it("names Rename and Delete in tooltips, not native titles", () => {
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...handlers()} />);
    const rename = screen.getByRole("button", { name: /^Rename / });
    const del = screen.getByRole("button", { name: /^Delete / });
    expect(rename).not.toHaveAttribute("title");
    expect(del).not.toHaveAttribute("title");
    expect(hoverTip(rename)).toHaveTextContent(rename.getAttribute("aria-label")!);
    fireEvent.pointerLeave(rename, { pointerType: "mouse" });
    expect(hoverTip(del)).toHaveTextContent(del.getAttribute("aria-label")!);
  });

  it("still names them while a write is pending and they are disabled", () => {
    render(<InstanceRow group={group} instance={instance} selected={false} pending canWrite canDelete {...handlers()} />);
    const rename = screen.getByRole("button", { name: /^Rename / });
    expect(rename).toBeDisabled();
    expect(hoverTip(rename.parentElement!)).toHaveTextContent(rename.getAttribute("aria-label")!);
  });
});
