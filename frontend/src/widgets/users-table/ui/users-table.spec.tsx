import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsersTable } from "./users-table";
import type { User } from "@/entities/user";

const user = (id: string, username: string, over: Partial<User> = {}): User => ({
  id,
  username,
  email: `${username}@example.com`,
  status: "active",
  totpEnabled: true,
  passkeyEnabled: false,
  roleSlugs: ["guest"],
  roleTitles: { guest: "Guest" },
  isOwner: false,
  totpRequired: false,
  ...over,
});

const USERS = [user("1", "a.ivanova", { isOwner: true }), user("2", "d.smirnov")];

describe("UsersTable", () => {
  it("renders one row per user under named columns", () => {
    render(<UsersTable users={USERS} />);
    expect(screen.getByRole("columnheader", { name: "User" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Passkey" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  });

  it("shows each user's identity", () => {
    render(<UsersTable users={USERS} />);
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.getByText("d.smirnov")).toBeInTheDocument();
  });

  it("builds row actions per user", () => {
    render(
      <UsersTable
        users={USERS}
        renderActions={(u) => <button type="button">{`Actions for ${u.username}`}</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Actions for a.ivanova" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for d.smirnov" })).toBeInTheDocument();
  });

  it("hosts the header action", () => {
    render(<UsersTable users={USERS} action={<button type="button">+ New user</button>} />);
    expect(screen.getByRole("button", { name: "+ New user" })).toBeInTheDocument();
  });

  it("invites an action instead of showing an empty table", () => {
    render(<UsersTable users={[]} action={<button type="button">+ New user</button>} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No users yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ New user" }).length).toBeGreaterThan(0);
  });

  it("takes a different title", () => {
    render(<UsersTable users={USERS} title="Company members" />);
    expect(screen.getByText("Company members")).toBeInTheDocument();
  });
});
