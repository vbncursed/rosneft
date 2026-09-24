import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstanceRow } from "./instance-row";
import { hoverTip } from "@/shared/ui/tooltip/testing";

const group = { model: { slug: "tank", title: "storage-tank-500" }, instances: [{ id: 2, index: 2, label: "Tank 2", hidden: false, groupId: null }] };
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
    render(<InstanceRow group={group} instance={instance} selected pending canWrite canDelete {...handlers()} onHide={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete storage-tank-500 #2" })).toBeDisabled();
    const eye = screen.getByRole("button", { name: "Hide storage-tank-500 #2" });
    expect(eye).toHaveAttribute("aria-busy", "true");
    expect(eye).not.toHaveAttribute("data-dim");
  });

  it("presses its buttons, and repaints a selection without a tween", () => {
    render(<InstanceRow group={group} instance={instance} selected pending={false} canWrite canDelete {...handlers()} />);
    expect(screen.getByRole("button", { name: "Rename storage-tank-500 #2" })).toHaveClass("enabled:active:scale-95");
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" })).toHaveClass("active:scale-[0.97]");
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" }).parentElement!.className).not.toMatch(/transition/);
  });
  it("presses Focus", () => {
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite={false} canDelete={false} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Focus storage-tank-500 #2" })).toHaveClass("enabled:active:scale-[0.97]", "ease-out");
  });
});

describe("InstanceRow · showModel", () => {
  // A user group mixes models, so `#1` alone names nothing there (spec §1.5).
  it("prints the model title before the number when asked, and only then", () => {
    const { rerender } = render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...handlers()} showModel />);
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" })).toHaveTextContent(/^storage-tank-500 #2 · Tank 2$/);
    rerender(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...handlers()} />);
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2" })).toHaveTextContent(/^#2 · Tank 2$/);
  });
});

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

describe("InstanceRow · hiding and groups", () => {
  const hidden = { ...instance, hidden: true };

  it("leads with an eye for a writer, handing the next hidden value on", async () => {
    const onHide = vi.fn();
    render(<InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...handlers()} onHide={onHide} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide storage-tank-500 #2" }));
    expect(onHide).toHaveBeenCalledWith(2, true);
  });

  // Spec §1.5: a hidden row is dimmed but stays interactive — select, rename, un-hide.
  it("dims a hidden row, keeps it selectable, and says hidden in its name", async () => {
    const h = handlers();
    render(<InstanceRow group={group} instance={hidden} selected={false} pending={false} canWrite canDelete {...h} onHide={vi.fn()} />);
    const select = screen.getByRole("button", { name: "storage-tank-500 #2 · Tank 2 · hidden" });
    expect(select).toHaveClass("opacity-55");
    await userEvent.click(select);
    expect(h.onSelect).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "Hide storage-tank-500 #2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers Move to group beside the pencil, with the territory's groups", async () => {
    const onMove = vi.fn();
    render(
      <InstanceRow group={group} instance={instance} selected={false} pending={false} canWrite canDelete {...handlers()}
        groups={[{ id: 4, title: "East yard" }]} onMove={onMove} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Move storage-tank-500 #2 to group" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "East yard" }));
    expect(onMove).toHaveBeenCalledWith(2, 4);
  });

  // Controller ruling (GF5 review): the trigger keeps the focus it holds after
  // a choice; the moves wait instead of the trigger.
  it("keeps Move to group focusable while its write is in flight", async () => {
    render(
      <InstanceRow group={group} instance={instance} selected={false} pending canWrite canDelete {...handlers()}
        groups={[{ id: 4, title: "East yard" }]} onMove={vi.fn()} />,
    );
    const move = screen.getByRole("button", { name: "Move storage-tank-500 #2 to group" });
    expect(move).toBeEnabled();
    await userEvent.click(move);
    expect(screen.getByRole("menuitem", { name: "East yard" })).toBeDisabled();
  });

  // The reader's mark sits in the eye's 24px box, so row text lines up with a writer's.
  it("boxes the reader's hidden mark at the eye's width", () => {
    const { container } = render(
      <InstanceRow group={group} instance={hidden} selected={false} pending={false} canWrite={false} canDelete={false} {...handlers()} />,
    );
    expect(container.querySelector("svg")!.parentElement).toHaveClass("size-6", "flex", "items-center", "justify-center");
  });

  it("gives a reader without write no eye and no move, only the hidden mark", () => {
    const { container } = render(
      <InstanceRow group={group} instance={hidden} selected={false} pending={false} canWrite={false} canDelete={false}
        {...handlers()} onHide={vi.fn()} groups={[{ id: 4, title: "East yard" }]} onMove={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move/ })).toBeNull();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  // Nothing is drawn to frame (§1.7); the disabled button explains itself.
  it("disables Focus on a hidden placement and says why", () => {
    render(<InstanceRow group={group} instance={hidden} selected={false} pending={false} canWrite={false} canDelete={false} {...handlers()} />);
    const focus = screen.getByRole("button", { name: "Focus storage-tank-500 #2 (hidden)" });
    expect(focus).toBeDisabled();
    expect(focus).not.toHaveAttribute("title");
    expect(hoverTip(focus.parentElement!)).toHaveTextContent("storage-tank-500 #2 is hidden");
  });
});
