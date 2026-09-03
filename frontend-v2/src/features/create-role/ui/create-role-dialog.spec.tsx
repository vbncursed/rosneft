import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateRoleDialog, type CreateRoleDialogProps } from "./create-role-dialog";

const START_FROM = [
  { slug: "field-operator", title: "field-operator", permissionSlugs: ["territory:read", "territory:write"] },
  { slug: "guest", title: "guest", permissionSlugs: ["territory:read"] },
];

const props = (over: Partial<CreateRoleDialogProps> = {}): CreateRoleDialogProps => ({
  open: true,
  startFrom: START_FROM,
  onClose: vi.fn(),
  onCreate: vi.fn(),
  ...over,
});

describe("CreateRoleDialog", () => {
  it("keeps Create role disabled until a title is entered", async () => {
    render(<CreateRoleDialog {...props()} />);
    const submit = screen.getByRole("button", { name: "Create role" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Title"), "Inspector");
    expect(submit).toBeEnabled();
  });

  it("defaults Start from to an empty set", async () => {
    const onCreate = vi.fn();
    render(<CreateRoleDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Title"), "Inspector");
    await userEvent.click(screen.getByRole("button", { name: "Create role" }));

    expect(onCreate).toHaveBeenCalledWith({ title: "Inspector", permissionSlugs: [] });
  });

  it("copies the chosen role's permission slugs when Start from is picked", async () => {
    const onCreate = vi.fn();
    render(<CreateRoleDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Title"), "Inspector");
    await userEvent.click(screen.getByRole("button", { name: /Empty set/ }));
    await userEvent.click(screen.getByRole("option", { name: /guest/ }));
    await userEvent.click(screen.getByRole("button", { name: "Create role" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Inspector",
      permissionSlugs: ["territory:read"],
    });
  });

  it("shows the confirm button loading while busy", () => {
    render(<CreateRoleDialog {...props({ busy: true })} />);
    expect(screen.getByRole("button", { name: "Create role" }).getAttribute("aria-busy")).toBe(
      "true",
    );
  });
});
