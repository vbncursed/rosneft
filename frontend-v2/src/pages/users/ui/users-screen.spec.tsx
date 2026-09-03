import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/entities/role";
import type { User } from "@/entities/user";
import type { PendingAction, UsersState } from "../model/use-users";
import { UsersScreen } from "./users-screen";

const { useUsers } = vi.hoisted(() => ({ useUsers: vi.fn() }));
vi.mock("../model/use-users", () => ({ useUsers }));

const USER: User = {
  id: "u-1",
  username: "a.ivanova",
  email: "a.ivanova@example.com",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: null,
  totpRequired: false,
  roleSlugs: ["guest"],
  roleTitles: { guest: "Guest" },
  isOwner: false,
};

const ROLE: Role = {
  slug: "guest",
  title: "Guest",
  kind: "system",
  permissionSlugs: [],
  grants: 0,
  users: 1,
  updated: "",
};

const state = (over: Partial<UsersState> = {}): UsersState => ({
  status: "ready",
  error: null,
  users: [USER],
  roles: [ROLE],
  canManage: true,
  query: "",
  setQuery: vi.fn(),
  selected: null,
  select: vi.fn(),
  pending: null,
  ask: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
  busy: false,
  creating: false,
  setCreating: vi.fn(),
  create: vi.fn(),
  createBusy: false,
  addingRole: false,
  setAddingRole: vi.fn(),
  setRoles: vi.fn(),
  rolesBusy: false,
  ...over,
});

const showing = (over: Partial<UsersState> = {}) => {
  const s = state(over);
  useUsers.mockReturnValue(s);
  render(<UsersScreen />);
  return s;
};

beforeEach(() => useUsers.mockReset());

describe("UsersScreen", () => {
  it("says it is loading rather than drawing an empty page", () => {
    showing({ status: "loading", users: null });
    expect(screen.getByLabelText("Loading people")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
  });

  it("says the list is unavailable, with the gateway's own words", () => {
    showing({ status: "unavailable", users: null, error: "You don't have permission to do this" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "People are unavailable: You don't have permission to do this",
    );
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
  });

  it("draws the people, grouped, once they are loaded", () => {
    showing();
    expect(screen.getByRole("heading", { level: 1, name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Guest" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "a.ivanova" })).toBeInTheDocument();
  });

  it("narrows the list by the filter the container holds", () => {
    showing({ query: "role:nobody" });
    expect(screen.queryByRole("article", { name: "a.ivanova" })).not.toBeInTheDocument();
    expect(screen.getByText("No one matches this filter.")).toBeInTheDocument();
  });

  it("opens the inspector on the selected person with the three factor rows", () => {
    showing({ selected: USER });
    expect(screen.getByRole("complementary", { name: "Person: a.ivanova" })).toBeInTheDocument();
    expect([...document.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([
      "status",
      "2FA",
      "passkey",
      "2FA required",
    ]);
    expect(screen.getByLabelText("Remove role Guest")).toBeInTheDocument();
  });

  it("asks before it freezes", async () => {
    const s = showing({ selected: USER });
    await userEvent.click(screen.getByRole("button", { name: "Freeze" }));
    expect(s.ask).toHaveBeenCalledWith("freeze");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("puts the question the container is holding in a dialog", () => {
    showing({ selected: USER, pending: { kind: "freeze", user: USER } });
    const dialog = screen.getByRole("dialog", { name: "Freeze a.ivanova?" });
    expect(
      within(dialog).getByText(
        "They are signed out everywhere and cannot sign in until unfrozen.",
      ),
    ).toBeInTheDocument();
    // The confirm button names the action exactly as the one that opened it.
    expect(within(dialog).getByRole("button", { name: "Freeze" })).toBeInTheDocument();
  });

  it("words a question for every action it can take", () => {
    const asked: [PendingAction["kind"], string, string][] = [
      ["freeze", "Freeze a.ivanova?", "Freeze"],
      ["unfreeze", "Unfreeze a.ivanova?", "Unfreeze"],
      ["delete", "Delete a.ivanova?", "Delete"],
      ["restore", "Restore a.ivanova?", "Restore"],
      ["require-2fa", "Require 2FA for a.ivanova?", "Require 2FA"],
      ["unrequire-2fa", "Stop requiring 2FA for a.ivanova?", "Stop requiring"],
    ];
    for (const [kind, title, confirmLabel] of asked) {
      cleanup();
      showing({ pending: { kind, user: USER } });
      const dialog = screen.getByRole("dialog", { name: title });
      expect(within(dialog).getByRole("button", { name: confirmLabel })).toBeInTheDocument();
    }
  });

  it("asks to restore rather than delete an account that is already gone", async () => {
    const gone = { ...USER, status: "deleted" as const };
    const s = showing({ users: [gone], selected: gone });
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(s.ask).toHaveBeenCalledWith("restore");
  });

  it("asks to unfreeze someone who is already frozen", async () => {
    const held = { ...USER, status: "frozen" as const };
    const s = showing({ users: [held], selected: held });
    await userEvent.click(screen.getByRole("button", { name: "Unfreeze" }));
    expect(s.ask).toHaveBeenCalledWith("unfreeze");
  });

  it("asks to stop requiring 2FA of someone who already must carry it", async () => {
    const pinned = { ...USER, totpRequired: true };
    const s = showing({ users: [pinned], selected: pinned });
    await userEvent.click(screen.getByRole("button", { name: "Stop requiring 2FA" }));
    expect(s.ask).toHaveBeenCalledWith("unrequire-2fa");
  });

  it("offers the create dialog only while the container says it is open", () => {
    showing();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    cleanup();
    showing({ creating: true });
    expect(screen.getByRole("dialog", { name: "Create user" })).toBeInTheDocument();
  });

  it("offers only the roles the person does not already hold", async () => {
    showing({
      selected: USER,
      addingRole: true,
      roles: [ROLE, { ...ROLE, slug: "ops", title: "Ops", kind: "custom" }],
    });
    expect(screen.getByRole("dialog", { name: "Add role" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Ops/ }));
    const list = within(screen.getByRole("listbox", { name: "Role" }));
    expect(list.getAllByRole("option")).toHaveLength(1);
    expect(list.getByRole("option", { name: /Ops/ })).toBeInTheDocument();
    expect(list.queryByRole("option", { name: /Guest/ })).not.toBeInTheDocument();
  });

  it("deselects when the inspector is closed", async () => {
    const s = showing({ selected: USER });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(s.select).toHaveBeenCalledWith(null);
  });

  it("opens the create dialog from the header", async () => {
    const s = showing();
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    expect(s.setCreating).toHaveBeenCalledWith(true);
  });

  it("removes a role by sending the set that is left", async () => {
    const two = { ...USER, roleSlugs: ["guest", "ops"], roleTitles: { guest: "Guest", ops: "Ops" } };
    const s = showing({ users: [two], selected: two });
    await userEvent.click(screen.getByLabelText("Remove role Guest"));
    expect(s.setRoles).toHaveBeenCalledWith(["ops"]);
  });

  it("adds a role by sending the set the person already holds plus it", async () => {
    const s = showing({
      selected: USER,
      addingRole: true,
      roles: [ROLE, { ...ROLE, slug: "ops", title: "Ops", kind: "custom" }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(s.setRoles).toHaveBeenCalledWith(["guest", "ops"]);
  });

  it("opens the add-role dialog from the chip row, and Cancel closes it", async () => {
    const s = showing({ selected: USER });
    await userEvent.click(screen.getByRole("button", { name: "+ add role" }));
    expect(s.setAddingRole).toHaveBeenCalledWith(true);

    cleanup();
    const open = showing({ selected: USER, addingRole: true });
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Add role" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(open.setAddingRole).toHaveBeenCalledWith(false);
  });

  it("locks Create while the account is being posted, so a second click cannot post again", async () => {
    showing({ creating: true, createBusy: true });
    const dialog = within(screen.getByRole("dialog", { name: "Create user" }));
    // A complete form: without the busy flag this button would be live.
    await userEvent.type(dialog.getByLabelText("Email"), "n@x");
    await userEvent.type(dialog.getByLabelText("Username"), "new.person");
    await userEvent.type(dialog.getByLabelText("Password"), "Passw0rd!");
    expect(dialog.getByRole("button", { name: "Create user" })).toBeDisabled();
  });

  it("closes the create dialog on Cancel", async () => {
    const s = showing({ creating: true });
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Create user" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(s.setCreating).toHaveBeenCalledWith(false);
  });

  it("hides the management controls from a reader who may not manage people", () => {
    showing({ selected: USER, canManage: false });
    expect(screen.queryByRole("button", { name: "+ New user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove role Guest")).not.toBeInTheDocument();
  });

  it("never offers a password reset — nothing can reset one yet", () => {
    showing({ selected: USER });
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
  });
});
