import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validatePassword } from "@/entities/user";
import { clearNotices } from "@/shared/lib/notify";
import { Toaster } from "@/widgets/toaster";
import { CreateUserDialog, type CreateUserDialogProps } from "./create-user-dialog";

vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(() => Promise.resolve(true)) }));

import { copyText } from "@/shared/lib/copy-text";

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

afterEach(() => clearNotices());

describe("CreateUserDialog", () => {
  it("keeps Create user disabled until email, username and password are all filled", async () => {
    render(<CreateUserDialog {...props()} />);
    const submit = screen.getByRole("button", { name: "Create user" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Email"), "a.ivanova@rosneft.test");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Username"), "a.ivanova");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^Password/), "S3cret!!");
    expect(submit).toBeEnabled();
  });

  it("includes a ticked role's slug and submits every field on create", async () => {
    const onCreate = vi.fn();
    render(<CreateUserDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Email"), "a.ivanova@rosneft.test");
    await userEvent.type(screen.getByLabelText("Username"), "a.ivanova");
    await userEvent.type(screen.getByLabelText(/^Password/), "S3cret!!");
    await userEvent.click(screen.getByRole("checkbox", { name: "guest" }));
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(onCreate).toHaveBeenCalledWith({
      email: "a.ivanova@rosneft.test",
      username: "a.ivanova",
      password: "S3cret!!",
      roleSlugs: ["guest"],
    });
  });

  it("removes a role's slug once it is unticked again", async () => {
    const onCreate = vi.fn();
    render(<CreateUserDialog {...props({ onCreate })} />);

    await userEvent.type(screen.getByLabelText("Email"), "a.ivanova@rosneft.test");
    await userEvent.type(screen.getByLabelText("Username"), "a.ivanova");
    await userEvent.type(screen.getByLabelText(/^Password/), "S3cret!!");
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
    await userEvent.type(screen.getByLabelText(/^Password/), "S3cret!!");
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

  it("generates a password that passes the rules, reveals it and copies it", async () => {
    render(
      <>
        <Toaster />
        <CreateUserDialog {...props()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    const input = screen.getByLabelText(/^Password/) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(validatePassword(input.value)).toBeNull();
    expect(copyText).toHaveBeenCalledWith(input.value);
    expect(await screen.findByText("Password copied")).toBeInTheDocument();
  });

  it("refuses a weak typed password before the gateway does", async () => {
    const created = props();
    render(<CreateUserDialog {...created} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@x");
    await userEvent.type(screen.getByLabelText("Username"), "a");
    // 8 chars — clears the length bound but has no upper-case letter, so this
    // exercises the class message rather than the length one.
    await userEvent.type(screen.getByLabelText(/^Password/), "s3cret!!");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByText(/Password needs an upper-/)).toBeInTheDocument();
    expect(created.onCreate).not.toHaveBeenCalled();
  });
});
