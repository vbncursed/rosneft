import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionMatrix } from "./permission-matrix";
import type { Permission } from "@/entities/permission";

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

    const locked = screen.getByRole("button", { name: "territory:delete" });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAttribute("title", "You cannot grant a permission you do not have");

    await userEvent.click(locked);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("leaves everything grantable when no allowlist is given", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeEnabled();
  });

  it("locks the whole matrix for a read-only role", async () => {
    const onToggle = vi.fn();
    render(<PermissionMatrix all={ALL} granted={["territory:read"]} onToggle={onToggle} readOnly />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();

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
    expect(screen.getByRole("button", { name: "territory:read" })).toHaveAttribute(
      "title",
      "See territories",
    );
  });
});

describe("PermissionMatrix · naming", () => {
  it("names each chip by its slug, so two 'write' chips stay distinct", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "territory:write" })).toHaveTextContent("write");
    expect(screen.queryAllByRole("button", { name: "write" })).toHaveLength(0);
  });
});
