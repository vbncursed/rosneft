import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserRow } from "./user-row";
import type { User } from "../model/user";

const user = (over: Partial<User> = {}): User => ({
  id: "u-2",
  username: "d.smirnov",
  email: "d.smirnov@example.com",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: false,
  roleSlugs: ["field-operator"],
  roleTitles: { "field-operator": "Field Operator" },
  isOwner: false,
  ...over,
});

// Column order, so a test can name the cell it means.
const [TOTP, PASSKEY] = [4, 5];

const row = (over: Partial<User> = {}) =>
  render(
    <table>
      <tbody>
        <UserRow user={user(over)} />
      </tbody>
    </table>,
  );

describe("UserRow", () => {
  it("shows the username, email and role title", () => {
    row();
    expect(screen.getByText("d.smirnov")).toBeInTheDocument();
    expect(screen.getByText("d.smirnov@example.com")).toBeInTheDocument();
    expect(screen.getByText("Field Operator")).toBeInTheDocument();
  });

  it("falls back to the slug for a role deleted after it was granted", () => {
    row({ roleSlugs: ["ghost"], roleTitles: {} });
    expect(screen.getByText("ghost")).toBeInTheDocument();
  });

  it("shows every granted role", () => {
    row({
      roleSlugs: ["a", "b"],
      roleTitles: { a: "People & Roles", b: "Guest" },
    });
    expect(screen.getByText("People & Roles")).toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("keeps the 2FA and passkey columns independent", () => {
    row({ totpEnabled: true, passkeyEnabled: false });
    const cells = screen.getAllByRole("cell");
    expect(cells[TOTP]).toHaveTextContent("Yes");
    expect(cells[PASSKEY]).toHaveTextContent("No");
  });

  it("distinguishes off from unknown — a wrong confident No is the bug to avoid", () => {
    const { unmount } = row({ totpEnabled: false });
    expect(screen.getAllByRole("cell")[TOTP].firstElementChild!.className).toContain("text-bad");
    unmount();

    row({ totpEnabled: null });
    const cell = screen.getAllByRole("cell")[TOTP];
    expect(cell).toHaveTextContent("—");
    expect(cell.firstElementChild!.className).toContain("text-dim");
  });

  it("tints the owner's row", () => {
    const { container } = row({ isOwner: true });
    expect(container.querySelector("tr")!.className).toContain("bg-accent-soft");
  });

  it("dims a deleted account", () => {
    const { container } = row({ status: "deleted" });
    expect(container.querySelector("tr")!.className).toContain("opacity-50");
    expect(screen.getByText("deleted")).toBeInTheDocument();
  });

  it("hosts its row actions", () => {
    render(
      <table>
        <tbody>
          <UserRow user={user()} actions={<button type="button">More</button>} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });
});
