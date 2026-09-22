import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionMatrix } from "./permission-matrix";
import type { Permission } from "@/entities/permission";
import { hoverTip } from "@/shared/ui/tooltip/testing";

const dotOf = (chip: HTMLElement) => chip.querySelector("span[aria-hidden]");

const ALL: Permission[] = [
  { slug: "territory:read", description: "See territories" },
  { slug: "territory:write" },
  { slug: "territory:delete" },
  { slug: "users:read" },
];

describe("PermissionMatrix", () => {
  it("groups permissions under their prefix and labels each by its action", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    expect(screen.getByText("territory")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "territory:read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "users:read" })).toBeInTheDocument();
  });

  it("marks the granted ones pressed", () => {
    render(<PermissionMatrix all={ALL} granted={["territory:write"]} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "territory:write" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "territory:delete" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles by slug, not by label", async () => {
    const onToggle = vi.fn();
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "territory:write" }));
    expect(onToggle).toHaveBeenCalledWith("territory:write");
  });

  it("locks a permission the actor does not hold, and says why", async () => {
    const onToggle = vi.fn();
    render(
      <PermissionMatrix
        all={ALL}
        granted={[]}
        onToggle={onToggle}
        grantable={new Set(["territory:read", "territory:write"])}
      />,
    );

    // Disabled, so never focused: the reason is in the name, not only the tooltip.
    const locked = screen.getByRole("button", { name: "territory:delete — you cannot grant a permission you do not have" });
    expect(locked).toBeDisabled();
    expect(locked).not.toHaveAttribute("title");
    expect(hoverTip(locked.parentElement!)).toHaveTextContent("You cannot grant a permission you do not have");

    await userEvent.click(locked);
    expect(onToggle).not.toHaveBeenCalled();
  });

  // A custom role can already hold a grant the actor lacks; the save is then
  // blocked, and the chip must show which grant is the reason.
  it("shows a granted chip the actor cannot grant as held and locked", async () => {
    const onToggle = vi.fn();
    render(
      <PermissionMatrix
        all={ALL}
        granted={["territory:delete"]}
        onToggle={onToggle}
        grantable={new Set(["territory:read"])}
      />,
    );
    const chip = screen.getByRole("button", { name: "territory:delete — you cannot grant a permission you do not have" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toBeDisabled();
    expect(chip).toHaveClass("border-dashed", "border-accent", "bg-accent-soft", "text-accent");
    expect(hoverTip(chip.parentElement!)).toHaveTextContent("You cannot grant a permission you do not have");
    expect(dotOf(chip)).toHaveClass("bg-warn");
    await userEvent.click(chip);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("leaves everything grantable when no allowlist is given", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeEnabled();
  });

  // aria-disabled, not disabled: the chip stays focusable, so a keyboard or
  // screen-reader user can still read what a system role holds.
  it("locks the whole matrix for a read-only role", async () => {
    const onToggle = vi.fn();
    render(<PermissionMatrix all={ALL} granted={["territory:read"]} onToggle={onToggle} readOnly />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toHaveClass("enabled:active:scale-[0.97]");
      expect(button).not.toHaveClass("cursor-pointer");
    }
    await userEvent.click(screen.getByRole("button", { name: "territory:read" }));

    await userEvent.click(screen.getByRole("button", { name: "territory:write" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("still reports what a read-only role holds", () => {
    render(<PermissionMatrix all={ALL} granted={["territory:read"]} onToggle={() => {}} readOnly />);
    expect(screen.getByRole("button", { name: "territory:read" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("tells a granted chip from an absent one on a read-only role, beyond colour", () => {
    render(<PermissionMatrix all={ALL} granted={["territory:read"]} onToggle={() => {}} readOnly />);
    const held = screen.getByRole("button", { name: "territory:read" });
    const absent = screen.getByRole("button", { name: "territory:write" });
    expect(held).toHaveClass("border-accent", "bg-accent-soft", "text-accent");
    expect(absent).toHaveClass("border-line", "text-dim");
    expect(absent).not.toHaveClass("opacity-50");
    // Filled dot for granted, a hollow ring for not.
    expect(dotOf(held)).toHaveClass("bg-accent");
    // border-dim, not line-2: the ring has to be visible against the panel.
    expect(dotOf(absent)).toHaveClass("border", "border-dim");
    expect(dotOf(absent)).not.toHaveClass("bg-line-2");
  });

  it("does not let an allowlist hide what a read-only role holds", () => {
    render(
      <PermissionMatrix
        all={ALL}
        granted={["territory:delete"]}
        grantable={new Set(["territory:read"])}
        onToggle={() => {}}
        readOnly
      />,
    );
    const held = screen.getByRole("button", { name: "territory:delete" });
    expect(held).toHaveAttribute("aria-pressed", "true");
    expect(held).toHaveClass("border-accent");
    expect(held).not.toHaveClass("border-dashed");
    expect(dotOf(held)).toHaveClass("bg-accent");
    // Read-only is not locked, and with no description there is nothing to say.
    expect(hoverTip(held)).toBeNull();
  });

  it("counts what is granted in each group", () => {
    render(<PermissionMatrix all={ALL} granted={["territory:read", "territory:write"]} onToggle={() => {}} />);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("0 / 1")).toBeInTheDocument();
  });

  it("gives every chip a dot, so state is not carried by the border alone", () => {
    const { container } = render(
      <PermissionMatrix
        all={ALL}
        granted={["territory:read"]}
        grantable={new Set(["territory:read", "territory:write"])}
        onToggle={() => {}}
      />,
    );
    const dots = [...container.querySelectorAll("span[aria-hidden]")].map((d) => d.className);
    expect(dots).toHaveLength(4);
    expect(dots.filter((c) => c.includes("bg-accent"))).toHaveLength(1);
    // A locked chip's dot warns: it needs Root to grant.
    expect(dots.filter((c) => c.includes("bg-warn"))).toHaveLength(2);
  });

  it("shows a permission's description as its tooltip", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    const chip = screen.getByRole("button", { name: "territory:read" });
    expect(chip).not.toHaveAttribute("title");
    expect(hoverTip(chip)).toHaveTextContent("See territories");
  });
});

describe("PermissionMatrix · naming", () => {
  it("names each chip by its slug, so two 'write' chips stay distinct", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "territory:write" })).toHaveTextContent("write");
    expect(screen.queryAllByRole("button", { name: "write" })).toHaveLength(0);
  });

  it("presses a chip it can toggle on pointer-down", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    const chip = screen.getAllByRole("button")[0];
    expect(chip).toHaveClass("transition-[color,background-color,border-color,scale]", "duration-150", "ease-out", "enabled:active:scale-[0.97]");
    expect(chip).not.toHaveClass("transition-colors");
  });
});

