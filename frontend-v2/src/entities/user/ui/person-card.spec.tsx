import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonCard } from "./person-card";
import type { User } from "../model/user";

const user = (over: Partial<User> = {}): User => ({
  id: "u-2",
  username: "d.smirnov",
  email: "d.smirnov@example.com",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: false,
  roleSlugs: ["field-operator"],
  roleTitles: { "field-operator": "field-operator" },
  isOwner: false,
  ...over,
});

const card = (over: Partial<User> = {}, props = {}) =>
  render(
    <PersonCard user={user(over)} territories="3 territories" lastSeen="yesterday 18:02" {...props} />,
  );

describe("PersonCard", () => {
  it("shows who the person is and when they were last seen", () => {
    card();
    expect(screen.getByText("d.smirnov")).toBeInTheDocument();
    expect(screen.getByText("d.smirnov@example.com")).toBeInTheDocument();
    expect(screen.getByText("3 territories")).toBeInTheDocument();
    expect(screen.getByText("yesterday 18:02")).toBeInTheDocument();
  });

  it("lists the granted roles by title", () => {
    card({ roleSlugs: ["root"], roleTitles: { root: "root" }, isOwner: true });
    expect(screen.getByText("root")).toBeInTheDocument();
  });

  it("marks weak auth in the chips and for a screen reader", () => {
    card();
    expect(screen.getByText("no 2fa")).toBeInTheDocument();
    expect(screen.getByText("no passkey")).toBeInTheDocument();
    expect(screen.getByText("Password only — no 2FA and no passkey.")).toBeInTheDocument();
  });

  it("says nothing about weak auth when either factor is present", () => {
    card({ totpEnabled: true });
    expect(screen.queryByText(/Password only/)).not.toBeInTheDocument();
    expect(screen.getByText("2fa")).toBeInTheDocument();
  });

  it("distinguishes an unknown factor from a missing one", () => {
    card({ totpEnabled: null, passkeyEnabled: true });
    expect(screen.getByText("2fa —")).toBeInTheDocument();
    expect(screen.getByText("passkey")).toBeInTheDocument();
  });

  it("replaces the auth chips with the state for a frozen or deleted account", () => {
    const { unmount } = card({ status: "frozen" });
    expect(screen.getByText("frozen")).toBeInTheDocument();
    expect(screen.queryByText("no 2fa")).not.toBeInTheDocument();
    unmount();

    card({ status: "deleted" });
    expect(screen.getByText("deleted")).toBeInTheDocument();
  });

  it("dims a deleted account", () => {
    const { container } = card({ status: "deleted" });
    expect(container.firstElementChild!.className).toContain("opacity-55");
  });

  it("gives the owner the soft accent avatar", () => {
    card({ isOwner: true });
    expect(screen.getByRole("img", { name: "d.smirnov" }).className).toContain("bg-accent-soft");
  });

  it("marks the selected card as current", () => {
    card({}, { selected: true });
    expect(screen.getByRole("article")).toHaveAttribute("aria-current", "true");
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    card({}, { onSelect });
    await userEvent.click(screen.getByRole("article", { name: "d.smirnov" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
