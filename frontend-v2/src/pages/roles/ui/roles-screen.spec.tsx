import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission } from "@/entities/permission";
import type { Role } from "@/entities/role";
import type { User } from "@/entities/user";
import type { RolesState } from "../model/use-roles";
import { RolesScreen } from "./roles-screen";

const { useRoles } = vi.hoisted(() => ({ useRoles: vi.fn() }));
vi.mock("../model/use-roles", () => ({ useRoles }));

const OPS: Role = {
  slug: "ops",
  title: "Operations",
  kind: "custom",
  permissionSlugs: ["users:read"],
  grants: 1,
  users: null,
  updated: "upd. 29.08",
};
const GUEST: Role = { ...OPS, slug: "guest", title: "Guest", kind: "system", permissionSlugs: [], grants: 0 };
const PERMISSIONS: Permission[] = [{ slug: "users:read" }, { slug: "users:write" }];
const USER: User = {
  id: "u-1",
  username: "a.ivanova",
  email: "a.ivanova@example.com",
  status: "active",
  totpEnabled: true,
  passkeyEnabled: null,
  totpRequired: false,
  roleSlugs: ["ops"],
  roleTitles: { ops: "Operations" },
  isOwner: true,
};

const state = (over: Partial<RolesState> = {}): RolesState => ({
  status: "ready",
  error: null,
  roles: [GUEST, OPS],
  permissions: PERMISSIONS,
  users: [USER],
  grantable: new Set(["users:read", "users:write"]),
  canManage: true,
  query: "",
  setQuery: vi.fn(),
  selected: null,
  draft: null,
  dirty: false,
  select: vi.fn(),
  toggle: vi.fn(),
  rename: vi.fn(),
  reset: vi.fn(),
  save: vi.fn(),
  saving: false,
  creating: false,
  setCreating: vi.fn(),
  create: vi.fn(),
  creatingBusy: false,
  ...over,
});

const showing = (over: Partial<RolesState> = {}) => {
  const s = state(over);
  useRoles.mockReturnValue(s);
  render(<RolesScreen />);
  return s;
};

const opened = (over: Partial<RolesState> = {}) =>
  showing({
    selected: OPS,
    draft: { title: OPS.title, granted: OPS.permissionSlugs },
    ...over,
  });

beforeEach(() => useRoles.mockReset());

describe("RolesScreen", () => {
  it("says it is loading rather than drawing an empty page", () => {
    showing({ status: "loading", roles: [], permissions: [], users: null });
    expect(screen.getByLabelText("Loading roles")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading", { name: "Roles & Permissions" })).not.toBeInTheDocument();
  });

  it("says the roles are unavailable, in the gateway's own words", () => {
    showing({ status: "unavailable", roles: [], error: "You don't have permission to do this" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Roles are unavailable: You don't have permission to do this",
    );
    expect(screen.queryByRole("heading", { name: "Roles & Permissions" })).not.toBeInTheDocument();
  });

  it("draws the roles in their two groups once they are loaded", () => {
    showing();
    expect(
      screen.getByRole("heading", { level: 1, name: "Roles & Permissions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "System roles" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Operations" })).toBeInTheDocument();
  });

  // The count is unknown, so the card says so instead of printing a zero.
  it("counts the holders of a role from the people the container read", () => {
    showing();
    expect(within(screen.getByRole("article", { name: "Operations" })).getByText("1 user"))
      .toBeInTheDocument();

    cleanup();
    showing({ users: null });
    expect(within(screen.getByRole("article", { name: "Operations" })).getByText("— users"))
      .toBeInTheDocument();
  });

  it("narrows the list by the filter the container holds", () => {
    showing({ query: "kind:system" });
    expect(screen.queryByRole("article", { name: "Operations" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Guest" })).toBeInTheDocument();
  });

  it("opens the inspector on the role the container has selected", () => {
    opened();
    expect(screen.getByRole("complementary", { name: "Role: Operations" })).toBeInTheDocument();
    expect(screen.getByLabelText("Role name")).toHaveValue("Operations");
  });

  it("draws no inspector while the selected role has no draft yet", () => {
    showing({ selected: OPS, draft: null });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows the unsaved title, not the one the gateway last returned", () => {
    opened({ draft: { title: "Field ops", granted: ["users:read"] }, dirty: true });
    expect(screen.getByLabelText("Role name")).toHaveValue("Field ops");
  });

  it("says a system role is read-only rather than only greying it out", () => {
    showing({ selected: GUEST, draft: { title: "Guest", granted: [] } });
    expect(
      screen.getByText("System roles are defined by migrations and cannot be edited here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save permissions" })).not.toBeInTheDocument();
  });

  it("saves and resets through the container", async () => {
    const s = opened({ dirty: true });
    await userEvent.click(screen.getByRole("button", { name: "Save permissions" }));
    expect(s.save).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(s.reset).toHaveBeenCalled();
  });

  it("locks the save while one is in flight", () => {
    opened({ dirty: true, saving: true });
    expect(screen.getByRole("button", { name: "Save permissions" })).toBeDisabled();
  });

  it("deselects when the inspector is closed", async () => {
    const s = opened();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(s.select).toHaveBeenCalledWith(null);
  });

  it("offers the create dialog only while the container says it is open", async () => {
    const s = showing();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ New role" }));
    expect(s.setCreating).toHaveBeenCalledWith(true);

    cleanup();
    showing({ creating: true });
    expect(screen.getByRole("dialog", { name: "Create role" })).toBeInTheDocument();
  });

  it("offers every existing role as a starting point", async () => {
    showing({ creating: true });
    await userEvent.click(screen.getByRole("button", { name: /Empty set/ }));
    const list = within(screen.getByRole("listbox", { name: "Start from" }));
    expect(list.getAllByRole("option")).toHaveLength(3);
    expect(list.getByRole("option", { name: /Empty set/ })).toBeInTheDocument();
    // The hint is the size of the set that would be copied.
    expect(list.getByRole("option", { name: /Guest/ })).toHaveTextContent("0");
    expect(list.getByRole("option", { name: /Operations/ })).toHaveTextContent("1");
  });

  it("closes the create dialog on Cancel", async () => {
    const s = showing({ creating: true });
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Create role" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(s.setCreating).toHaveBeenCalledWith(false);
  });

  it("locks Create while the role is being posted", async () => {
    showing({ creating: true, creatingBusy: true });
    const dialog = within(screen.getByRole("dialog", { name: "Create role" }));
    await userEvent.type(dialog.getByLabelText("Title"), "Surveyor");
    expect(dialog.getByRole("button", { name: "Create role" })).toBeDisabled();
  });

  // The gateway checks the whole resulting set, so a role holding a grant this
  // actor cannot hand out is unsaveable however it is edited. Say so rather
  // than letting them press Save into a 403.
  it("blocks the save on a role holding a grant this actor cannot hand out", () => {
    opened({ dirty: true, grantable: new Set(["users:write"]) });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This role holds permissions you can't grant, so it can't be saved from here.",
    );
    expect(screen.getByRole("button", { name: "Save permissions" })).toBeDisabled();
  });

  it("leaves the save alone when every grant the role holds is within reach", () => {
    opened({ dirty: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save permissions" })).toBeEnabled();
  });

  // A reader has no Save to block; the read-only notice already says why.
  it("says nothing about saving to someone who may not manage roles", () => {
    opened({ canManage: false, grantable: new Set(["users:write"]) });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers as a starting point only the sets it could save", async () => {
    showing({ creating: true, grantable: new Set(["users:write"]) });
    await userEvent.click(screen.getByRole("button", { name: /Empty set/ }));
    const list = within(screen.getByRole("listbox", { name: "Start from" }));
    // Guest holds nothing, so it stays; Operations holds users:read, which
    // this actor cannot grant.
    expect(list.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Empty set"),
      expect.stringContaining("Guest"),
    ]);
  });

  // roles:read alone gets past the screen gate, so the inspector must be
  // read-only too — an enabled Save there only earns a 403.
  it("hides every way in from someone who may not manage roles", () => {
    opened({ canManage: false });
    expect(screen.queryByRole("button", { name: "+ New role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create a role/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save permissions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Role name" })).toHaveAttribute("readonly");
    expect(
      screen.getByText("You can view roles here, but changing one needs roles:manage."),
    ).toBeInTheDocument();
  });
});
