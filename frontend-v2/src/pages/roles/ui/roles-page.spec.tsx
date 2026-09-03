import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RolesPage, type RolesPageProps } from "./roles-page";
import type { Permission } from "@/entities/permission";
import type { Role } from "@/entities/role";

const ALL: Permission[] = [
  { slug: "territory:read" },
  { slug: "territory:write" },
  { slug: "users:write" },
  { slug: "audit:read" },
];

const role = (slug: string, title: string, kind: Role["kind"] = "custom"): Role => ({
  slug,
  title,
  kind,
  permissionSlugs: [],
  grants: 2,
  users: 11,
  updated: "upd. 29.08",
});

const props = (over: Partial<RolesPageProps> = {}): RolesPageProps => ({
  groups: [
    {
      key: "system",
      label: "System roles",
      note: "read-only · defined by migrations",
      roles: [{ role: role("root", "Root", "system"), tone: "accent", tag: "owner" }],
    },
    {
      key: "custom",
      label: "Custom roles",
      note: "2 roles · editable",
      roles: [{ role: role("field-operator", "Field Operator") }],
    },
  ],
  allPermissions: ALL,
  distribution: {
    label: "People by role",
    detail: "26 accounts",
    segments: [
      { tone: "accent", value: 11, label: "field-operator" },
      { tone: "neutral", value: 9, label: "guest" },
    ],
  },
  stats: [
    { label: "Roles", value: "5", hint: "2 system · 3 custom" },
    { label: "Permissions", value: "15", hint: "5 resource groups" },
    { label: "Root holders", value: "1", hint: "unrestricted access", tone: "accent" },
  ],
  query: "",
  onQueryChange: vi.fn(),
  selectedSlug: null,
  onSelect: vi.fn(),
  onCloseInspector: vi.fn(),
  onTogglePermission: vi.fn(),
  onRenameRole: vi.fn(),
  onResetRole: vi.fn(),
  onSaveRole: vi.fn(),
  onCreateRole: vi.fn(),
  ...over,
});

const edited = (over = {}) => ({
  role: role("field-operator", "Field Operator"),
  granted: ["territory:read", "territory:write"],
  ...over,
});

describe("RolesPage", () => {
  it("names the page with one h1", () => {
    render(<RolesPage {...props()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Roles & Permissions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Access control · permission sets")).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<RolesPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("summarises the roles above the list", () => {
    render(<RolesPage {...props()} />);
    expect(screen.getByText("26 accounts")).toBeInTheDocument();
    expect(screen.getByLabelText("Roles: 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Root holders: 1").className).toContain("text-accent");
  });

  it("groups system and custom roles apart", () => {
    render(<RolesPage {...props()} />);
    expect(screen.getByRole("region", { name: "System roles" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Custom roles" })).toBeInTheDocument();
  });

  it("gives every role meter the whole permission set as its denominator", () => {
    render(<RolesPage {...props()} />);
    expect(screen.getAllByText("2/4")).toHaveLength(2);
  });

  it("selects a role from the list", async () => {
    const onSelect = vi.fn();
    render(<RolesPage {...props({ onSelect })} />);
    await userEvent.click(screen.getByRole("article", { name: "Field Operator" }));
    expect(onSelect).toHaveBeenCalledWith("field-operator");
  });

  it("keeps the inspector out of the tree until a role is open", () => {
    render(<RolesPage {...props({ selectedSlug: "field-operator", edited: null })} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the inspector on the selected role", () => {
    render(<RolesPage {...props({ selectedSlug: "field-operator", edited: edited() })} />);
    expect(
      screen.getByRole("complementary", { name: "Role: Field Operator" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });

  it("toggles a permission through the inspector", async () => {
    const onTogglePermission = vi.fn();
    render(
      <RolesPage
        {...props({ selectedSlug: "field-operator", edited: edited(), onTogglePermission })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "users:write" }));
    expect(onTogglePermission).toHaveBeenCalledWith("users:write");
  });

  it("saves only once something changed", async () => {
    const onSaveRole = vi.fn();
    const { rerender } = render(
      <RolesPage {...props({ selectedSlug: "field-operator", edited: edited(), onSaveRole })} />,
    );
    expect(screen.getByRole("button", { name: "Save permissions" })).toBeDisabled();

    rerender(
      <RolesPage
        {...props({
          selectedSlug: "field-operator",
          edited: edited({ dirty: true }),
          onSaveRole,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save permissions" }));
    expect(onSaveRole).toHaveBeenCalledOnce();
  });

  it("offers two ways to create a role, both reaching the same handler", async () => {
    const onCreateRole = vi.fn();
    render(<RolesPage {...props({ onCreateRole })} />);

    await userEvent.click(screen.getByRole("button", { name: "+ New role" }));
    await userEvent.click(screen.getByRole("button", { name: /Create a role/ }));
    expect(onCreateRole).toHaveBeenCalledTimes(2);
  });

  it("hides both creation controls from a reader who may not manage roles", () => {
    render(<RolesPage {...props({ canManage: false })} />);
    expect(screen.queryByRole("button", { name: "+ New role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create a role/ })).not.toBeInTheDocument();
  });

  it("says so when the filter matches nothing", () => {
    render(
      <RolesPage {...props({ groups: [{ key: "custom", label: "Custom roles", roles: [] }] })} />,
    );
    expect(screen.getByText("No roles match this filter.")).toBeInTheDocument();
  });
});
