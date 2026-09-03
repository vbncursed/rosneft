import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateUserDialog, type CreateUserDialogProps } from "./create-user-dialog";

const ROLES = [
  { slug: "field-operator", title: "field-operator" },
  { slug: "guest", title: "guest" },
];

const props = (over: Partial<CreateUserDialogProps> = {}): CreateUserDialogProps => ({
  open: true,
  roles: ROLES,
  onClose: vi.fn(),
  onCreate: vi.fn(),
  ...over,
});

describe("CreateUserDialog", () => {
  it("keeps Create user disabled until email, username and password are all filled", async () => {
    render(<CreateUserDialog {...props()} />);
    const submit = screen.getByRole("button", { name: "Create user" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Email"), "a.ivanova@rosneft.test");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Username"), "a.ivanova");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^Password/), "s3cret!");
    expect(submit).toBeEnabled();
  });

  it("includes a ticked role's slug and submits every field on create", async () => {
    const onCreate = vi.fn();
    render(<CreateUserDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Email"), "a.ivanova@rosneft.test");
    await userEvent.type(screen.getByLabelText("Username"), "a.ivanova");
    await userEvent.type(screen.getByLabelText(/^Password/), "s3cret!");
    await userEvent.click(screen.getByRole("checkbox", { name: "guest" }));
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(onCreate).toHaveBeenCalledWith({
      email: "a.ivanova@rosneft.test",
      username: "a.ivanova",
      password: "s3cret!",
      roleSlugs: ["guest"],
    });
  });

  it("removes a role's slug once it is unticked again", async () => {
    const onCreate = vi.fn();
    render(<CreateUserDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Email"), "a.ivanova@rosneft.test");
    await userEvent.type(screen.getByLabelText("Username"), "a.ivanova");
    await userEvent.type(screen.getByLabelText(/^Password/), "s3cret!");
    const guest = screen.getByRole("checkbox", { name: "guest" });
    await userEvent.click(guest);
    await userEvent.click(guest);
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ roleSlugs: [] }));
  });

  it("renders no role group at all when there are no roles to grant", () => {
    render(<CreateUserDialog {...props({ roles: [] })} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("submits no roles when none were ticked", async () => {
    const onCreate = vi.fn();
    render(<CreateUserDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Email"), "a@b.test");
    await userEvent.type(screen.getByLabelText("Username"), "a");
    await userEvent.type(screen.getByLabelText(/^Password/), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ roleSlugs: [] }),
    );
  });

  it("shows the confirm button loading while busy", () => {
    render(<CreateUserDialog {...props({ busy: true })} />);
    const submit = screen.getByRole("button", { name: "Create user" });
    expect(submit.getAttribute("aria-busy")).toBe("true");
  });
});
