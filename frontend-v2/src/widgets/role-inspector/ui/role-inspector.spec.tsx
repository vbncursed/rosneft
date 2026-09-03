import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoleInspector, type RoleInspectorProps } from "./role-inspector";
import type { Role } from "@/entities/role";
import type { Permission } from "@/entities/permission";

const ALL: Permission[] = [
  { slug: "territory:read" },
  { slug: "territory:write" },
  { slug: "users:write" },
  { slug: "audit:read" },
];

const role = (over: Partial<Role> = {}): Role => ({
  slug: "field-operator",
  title: "Field Operator",
  kind: "custom",
  permissionSlugs: [],
  grants: 2,
  users: 11,
  updated: "upd. 29.08",
  ...over,
});

const props = (over: Partial<RoleInspectorProps> = {}): RoleInspectorProps => ({
  role: role(),
  onRename: vi.fn(),
  onClose: vi.fn(),
  all: ALL,
  granted: ["territory:read", "territory:write"],
  onToggle: vi.fn(),
  onReset: vi.fn(),
  onSave: vi.fn(),
  ...over,
});

describe("RoleInspector", () => {
  it("is a region named after the role", () => {
    render(<RoleInspector {...props()} />);
    expect(screen.getByRole("complementary", { name: "Role: Field Operator" })).toBeInTheDocument();
    expect(screen.getByText(/field-operator · 11 users/)).toBeInTheDocument();
  });

  it("meters how much of the set is granted", () => {
    render(<RoleInspector {...props()} />);
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Field Operator permissions granted" }),
    ).toHaveAttribute("aria-valuenow", "50");
  });

  it("renames as you type", async () => {
    const onRename = vi.fn();
    render(<RoleInspector {...props({ onRename })} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Role name" }), "s");
    expect(onRename).toHaveBeenCalled();
  });

  it("toggles a permission", async () => {
    const onToggle = vi.fn();
    render(<RoleInspector {...props({ onToggle })} />);
    await userEvent.click(screen.getByRole("button", { name: "territory:write" }));
    expect(onToggle).toHaveBeenCalledWith("territory:write");
  });

  it("warns about locked chips only when some are locked and it is editable", () => {
    const { rerender } = render(<RoleInspector {...props()} />);
    expect(screen.queryByText(/Locked chips need Root/)).not.toBeInTheDocument();

    rerender(
      <RoleInspector {...props({ grantable: new Set(["territory:read", "territory:write"]) })} />,
    );
    expect(screen.getByText(/Locked chips need Root/)).toBeInTheDocument();
  });

  it("shows a system role read-only, with no save controls", () => {
    render(<RoleInspector {...props({ role: role({ kind: "system", title: "Guest" }) })} />);
    expect(screen.getByText("Viewing role")).toBeInTheDocument();
    expect(screen.getByText(/System roles are defined by migrations/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save permissions" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Role name" })).toHaveAttribute("readonly");
  });

  it("cannot toggle a system role's permissions", async () => {
    const onToggle = vi.fn();
    render(
      <RoleInspector {...props({ role: role({ kind: "system" }), onToggle })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "territory:write" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("offers to save only once something changed", async () => {
    const onSave = vi.fn();
    const { rerender } = render(<RoleInspector {...props({ onSave })} />);
    expect(screen.getByRole("button", { name: "Save permissions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();

    rerender(<RoleInspector {...props({ onSave, dirty: true })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save permissions" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("blocks editing while a save is in flight", async () => {
    const onToggle = vi.fn();
    render(<RoleInspector {...props({ dirty: true, saving: true, onToggle })} />);
    expect(screen.getByRole("button", { name: /Save permissions/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "territory:write" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("closes", async () => {
    const onClose = vi.fn();
    render(<RoleInspector {...props({ onClose })} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
