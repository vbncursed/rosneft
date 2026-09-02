import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoleCard } from "./role-card";
import type { Role } from "../model/role";

const role = (over: Partial<Role> = {}): Role => ({
  slug: "field-operator",
  title: "Field Operator",
  kind: "custom",
  grants: 6,
  users: 11,
  updated: "upd. 29.08",
  ...over,
});

const card = (props = {}) =>
  render(<RoleCard role={role()} totalPermissions={15} {...props} />);

describe("RoleCard", () => {
  it("names the role by title and slug", () => {
    card();
    expect(screen.getByText("Field Operator")).toBeInTheDocument();
    expect(screen.getByText("field-operator")).toBeInTheDocument();
  });

  it("meters how much of the permission set it grants", () => {
    card();
    expect(screen.getByText("6/15")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Field Operator permissions granted" }),
    ).toHaveAttribute("aria-valuenow", "40");
  });

  it("counts its holders, agreeing in number", () => {
    const { unmount } = card();
    expect(screen.getByText("11 users")).toBeInTheDocument();
    unmount();

    render(<RoleCard role={role({ users: 1 })} totalPermissions={15} />);
    expect(screen.getByText("1 user")).toBeInTheDocument();
  });

  it("shows when it last moved", () => {
    card();
    expect(screen.getByText("upd. 29.08")).toBeInTheDocument();
  });

  it("shows a tag only when there is one", () => {
    const { unmount } = card();
    expect(screen.queryByText("editing")).not.toBeInTheDocument();
    unmount();

    card({ tag: "editing", tagTone: "accent" });
    expect(screen.getByText("editing").className).toContain("text-accent");
  });

  it("lists representative grants as chips", () => {
    card({
      chips: [
        { label: "territory.write" },
        { label: "all permissions", tone: "strong" },
        { label: "users.write", tone: "locked" },
      ],
    });
    expect(screen.getByText("territory.write").className).toContain("bg-panel-2");
    expect(screen.getByText("all permissions").className).toContain("text-accent");
    expect(screen.getByText("users.write").className).toContain("text-dim");
  });

  it("stacks the holders' avatars", () => {
    card({ faces: ["d.smirnov", "k.petrov"] });
    expect(screen.getByRole("img", { name: "d.smirnov" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "k.petrov" })).toBeInTheDocument();
  });

  it("renders without faces at all", () => {
    card();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("11 users")).toBeInTheDocument();
  });

  it("colours its rail by tone", () => {
    const { container } = card({ tone: "warn" });
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-warn");
  });

  it("marks the selected role as current and brightens its rail", () => {
    const { container, rerender } = card();
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("opacity-50");

    rerender(<RoleCard role={role()} totalPermissions={15} selected />);
    expect(screen.getByRole("article")).toHaveAttribute("aria-current", "true");
    expect(container.querySelector("span[aria-hidden]")!.className).not.toContain("opacity-50");
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    card({ onSelect });
    await userEvent.click(screen.getByRole("article", { name: "Field Operator" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
