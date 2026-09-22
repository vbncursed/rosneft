import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoleChips } from "./role-chips";

const ROLES = [
  { slug: "field-operator", title: "field-operator" },
  { slug: "guest", title: "guest" },
];

const props = { onRemove: vi.fn(), onAdd: vi.fn() };

describe("RoleChips", () => {
  it("shows one chip per granted role", () => {
    render(<RoleChips roles={ROLES} {...props} />);
    expect(screen.getByText("field-operator")).toBeInTheDocument();
    expect(screen.getByText("guest")).toBeInTheDocument();
  });

  it("removes the role it was asked to", async () => {
    const onRemove = vi.fn();
    render(<RoleChips roles={ROLES} {...props} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove role guest" }));
    expect(onRemove).toHaveBeenCalledWith("guest");
  });

  it("offers a way to grant another", async () => {
    const onAdd = vi.fn();
    render(<RoleChips roles={ROLES} {...props} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: "add role" }));
    // A drawn plus, not a typed "+": the name and text carry the label alone.
    expect(screen.getByRole("button", { name: "add role" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "add role" })).toHaveTextContent(/^add role$/);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("takes a different label for the add control", () => {
    render(<RoleChips roles={[]} {...props} addLabel="grant" />);
    expect(screen.getByRole("button", { name: "grant" })).toBeInTheDocument();
    // A drawn plus, not a typed "+": the name and text carry the label alone.
    expect(screen.getByRole("button", { name: "grant" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "grant" })).toHaveTextContent(/^grant$/);
  });

  it("hides every control when the reader may not edit", () => {
    render(<RoleChips roles={ROLES} {...props} readOnly />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("field-operator")).toBeInTheDocument();
  });

  it("says so when a read-only person holds no roles at all", () => {
    render(<RoleChips roles={[]} {...props} readOnly />);
    expect(screen.getByText("No roles granted.")).toBeInTheDocument();
  });

  it("still offers the add control when an editable person holds none", () => {
    render(<RoleChips roles={[]} {...props} />);
    expect(screen.getByRole("button", { name: "add role" })).toBeInTheDocument();
    expect(screen.queryByText("No roles granted.")).not.toBeInTheDocument();
  });

  it("presses its add and remove controls on pointer-down", () => {
    render(<RoleChips roles={ROLES} {...props} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("duration-150", "ease-out");
      expect(button.className).toMatch(/active:scale-(95|\[0\.97\])/);
      expect(button).not.toHaveClass("transition-colors");
    }
  });
});

describe("RoleChips · remove mark", () => {
  it("draws the remove button as an icon, not a × character", () => {
    render(<RoleChips roles={ROLES} {...props} />);
    const remove = screen.getByRole("button", { name: "Remove role guest" });
    expect(remove.querySelector("svg")).not.toBeNull();
    expect(remove.textContent).toBe("");
  });
});
