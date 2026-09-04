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

const custom = (over: Partial<Role> = {}): Role => role(over);
const system = (over: Partial<Role> = {}): Role => role({ kind: "system", ...over });

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

  // A reader who holds roles:read but not roles:manage reaches this screen.
  // Nothing they can press may exist: an enabled Save here only earns a 403.
  it("shows a custom role read-only to someone who may not manage roles", async () => {
    const onToggle = vi.fn();
    render(<RoleInspector {...props({ readOnly: true, dirty: true, onToggle })} />);
    expect(screen.getByText("Viewing role")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save permissions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Role name" })).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "territory:write" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  // Not "this role is immutable" — the role is fine, the reader lacks a grant.
  it("says why it is read-only, and does not blame the role", () => {
    render(<RoleInspector {...props({ readOnly: true })} />);
    expect(
      screen.getByText("You can view roles here, but changing one needs roles:manage."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/System roles are defined by migrations/)).not.toBeInTheDocument();
  });

  it("blames the migrations when the role really is a system one", () => {
    render(<RoleInspector {...props({ readOnly: true, role: role({ kind: "system" }) })} />);
    expect(screen.getByText(/System roles are defined by migrations/)).toBeInTheDocument();
    expect(screen.queryByText(/needs roles:manage/)).not.toBeInTheDocument();
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

  // The matrix stops the actor adding a grant they lack, but the gateway checks
  // the whole resulting set and PUT replaces it — so a role that already holds
  // one cannot be saved at all, and pressing Save would only earn a 403.
  it("refuses the save and says why when the role holds a grant the actor lacks", () => {
    render(
      <RoleInspector
        {...props({ dirty: true, saveBlocked: "This role holds permissions you can't grant." })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This role holds permissions you can't grant.",
    );
    expect(screen.getByRole("button", { name: "Save permissions" })).toBeDisabled();
    // Reset still works: dropping the edits is always allowed.
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  // Two callouts saying the same thing in different words is one too many.
  it("drops the weaker locked-chip warning while the save is blocked", () => {
    render(
      <RoleInspector
        {...props({
          grantable: new Set(["territory:read", "territory:write"]),
          saveBlocked: "This role holds permissions you can't grant.",
        })}
      />,
    );
    expect(screen.queryByText(/Locked chips need Root/)).not.toBeInTheDocument();
  });

  it("closes", async () => {
    const onClose = vi.fn();
    render(<RoleInspector {...props({ onClose })} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers Delete on a custom role nobody holds, and not on a system role or to a reader", () => {
    const onDelete = vi.fn();
    const { rerender } = render(<RoleInspector {...props({ role: custom({ users: 0 }), onDelete })} />);
    expect(screen.getByRole("button", { name: "Delete role" })).toBeEnabled();
    rerender(<RoleInspector {...props({ role: system(), onDelete })} />);
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
    rerender(<RoleInspector {...props({ role: custom({ users: 0 }), onDelete, readOnly: true })} />);
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
  });

  it("blocks Delete while people hold the role, and says how many", () => {
    const onDelete = vi.fn();
    render(<RoleInspector {...props({ role: custom({ users: 3 }), onDelete })} />);
    const button = screen.getByRole("button", { name: "Delete role" });
    expect(button).toBeDisabled();
    expect(screen.getByText("3 users hold this role — reassign them first")).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription("3 users hold this role — reassign them first");
  });

  it("says one user, singular, when only one holds the role", () => {
    const onDelete = vi.fn();
    render(<RoleInspector {...props({ role: custom({ users: 1 }), onDelete })} />);
    expect(screen.getByText("1 user holds this role — reassign them first")).toBeInTheDocument();
  });

  it("leaves Delete enabled when the count is unknown — the gateway is the guard then", () => {
    const onDelete = vi.fn();
    render(<RoleInspector {...props({ role: custom({ users: null }), onDelete })} />);
    expect(screen.getByRole("button", { name: "Delete role" })).toBeEnabled();
  });

  it("shows neither the button nor the hint without a delete handler", () => {
    render(<RoleInspector {...props({ role: custom({ users: 3 }) })} />);
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
    expect(screen.queryByText(/reassign them first/)).not.toBeInTheDocument();
  });
});
