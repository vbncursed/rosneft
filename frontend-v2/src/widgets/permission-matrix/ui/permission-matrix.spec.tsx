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
    expect(screen.getAllByRole("button", { name: "read" })).toHaveLength(2);
  });

  it("marks the granted ones pressed", () => {
    render(<PermissionMatrix all={ALL} granted={["territory:write"]} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "write" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "delete" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles by slug, not by label", async () => {
    const onToggle = vi.fn();
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "write" }));
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

    const locked = screen.getByRole("button", { name: "delete" });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAttribute("title", "You cannot grant a permission you do not have");

    await userEvent.click(locked);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("leaves everything grantable when no allowlist is given", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    for (const name of ["read", "write", "delete"]) {
      for (const button of screen.getAllByRole("button", { name })) {
        expect(button).toBeEnabled();
      }
    }
  });

  it("locks the whole matrix while disabled", async () => {
    const onToggle = vi.fn();
    render(<PermissionMatrix all={ALL} granted={["territory:read"]} onToggle={onToggle} disabled />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "write" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows a permission's description as its tooltip", () => {
    render(<PermissionMatrix all={ALL} granted={[]} onToggle={() => {}} />);
    expect(screen.getAllByRole("button", { name: "read" })[0]).toHaveAttribute(
      "title",
      "See territories",
    );
  });
});
