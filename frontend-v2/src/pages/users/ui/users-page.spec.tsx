import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsersPage, type UsersPageProps } from "./users-page";
import type { User } from "@/entities/user";

const user = (id: string, username: string, over: Partial<User> = {}): User => ({
  id,
  username,
  email: `${username}@example.com`,
  status: "active",
  totpEnabled: true,
  passkeyEnabled: true,
  roleSlugs: ["field-operator"],
  roleTitles: { "field-operator": "field-operator" },
  isOwner: false,
  ...over,
});

const person = (id: string, username: string, over: Partial<User> = {}) => ({
  user: user(id, username, over),
  territories: "3 territories",
  lastSeen: "yesterday 18:02",
});

const props = (over: Partial<UsersPageProps> = {}): UsersPageProps => ({
  groups: [
    { key: "admins", label: "Owners & admins", people: [person("u-1", "a.ivanova")], total: 3 },
    { key: "ops", label: "Field operators", people: [person("u-2", "d.smirnov")], total: 11 },
  ],
  coverage: {
    label: "2FA coverage",
    detail: "18 / 26",
    segments: [
      { tone: "ok", value: 18, label: "2FA + passkey" },
      { tone: "warn", value: 3, label: "2FA only" },
      { tone: "bad", value: 5, label: "password only" },
    ],
  },
  stats: [
    { label: "Accounts", value: "26", hint: "24 active · 2 frozen" },
    { label: "Roles in use", value: "4", hint: "2 system · 2 custom" },
    { label: "Needs attention", value: "5", hint: "no second factor", tone: "bad" },
  ],
  query: "",
  onQueryChange: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  onCloseInspector: vi.fn(),
  onCreateUser: vi.fn(),
  onResetPassword: vi.fn(),
  onRequire2fa: vi.fn(),
  onFreeze: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe("UsersPage", () => {
  it("names the page with one h1", () => {
    render(<UsersPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Users" })).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<UsersPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("summarises the population above the list", () => {
    render(<UsersPage {...props()} />);
    expect(screen.getByText("18 / 26")).toBeInTheDocument();
    expect(screen.getByLabelText("Accounts: 26")).toBeInTheDocument();
    expect(screen.getByLabelText("Needs attention: 5").className).toContain("text-bad");
  });

  it("groups the people it is given", () => {
    render(<UsersPage {...props()} />);
    expect(screen.getByRole("region", { name: "Owners & admins" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Field operators" })).toBeInTheDocument();
  });

  it("reports typing in the filter", async () => {
    const onQueryChange = vi.fn();
    render(<UsersPage {...props({ onQueryChange })} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Filter people" }), "2");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("shows a filter chip for a key:value query", () => {
    render(<UsersPage {...props({ query: "2fa:off" })} />);
    expect(screen.getByRole("button", { name: "Remove filter 2fa:off" })).toBeInTheDocument();
  });

  it("selects a person from the grid", async () => {
    const onSelect = vi.fn();
    render(<UsersPage {...props({ onSelect })} />);
    await userEvent.click(screen.getByRole("article", { name: "d.smirnov" }));
    expect(onSelect).toHaveBeenCalledWith("u-2");
  });

  it("keeps the inspector out of the tree until someone is open", () => {
    render(<UsersPage {...props()} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the inspector with the details and body it is handed", () => {
    render(
      <UsersPage
        {...props({
          selectedId: "u-2",
          inspected: {
            user: user("u-2", "d.smirnov"),
            details: [{ label: "sessions", value: "2 devices" }],
            body: <p>roles and territories</p>,
          },
        })}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Person: d.smirnov" })).toBeInTheDocument();
    expect(screen.getByText("2 devices")).toBeInTheDocument();
    expect(screen.getByText("roles and territories")).toBeInTheDocument();
  });

  it("waits for the detail rather than showing a half-empty inspector", () => {
    render(<UsersPage {...props({ selectedId: "u-2", inspected: null })} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "d.smirnov" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("creates a user", async () => {
    const onCreateUser = vi.fn();
    render(<UsersPage {...props({ onCreateUser })} />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    expect(onCreateUser).toHaveBeenCalledOnce();
  });

  it("hides every management control from a reader who may not manage people", () => {
    render(
      <UsersPage
        {...props({
          canManage: false,
          selectedId: "u-2",
          inspected: { user: user("u-2", "d.smirnov"), details: [], body: null },
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "+ New user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("says so when the filter matches nobody", () => {
    render(
      <UsersPage
        {...props({
          query: "role:nobody",
          groups: [{ key: "ops", label: "Field operators", people: [] }],
        })}
      />,
    );
    expect(screen.getByText("No one matches this filter.")).toBeInTheDocument();
  });
});
