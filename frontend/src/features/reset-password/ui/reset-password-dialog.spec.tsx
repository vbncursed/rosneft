import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validatePassword } from "@/entities/user";
import { copyText } from "@/shared/lib/copy-text";
import { clearNotices } from "@/shared/lib/notify";
import { Toaster } from "@/widgets/toaster";
import { ResetPasswordDialog, type ResetPasswordDialogProps } from "./reset-password-dialog";

vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(() => Promise.resolve(true)) }));

const props = (over: Partial<ResetPasswordDialogProps> = {}): ResetPasswordDialogProps => ({
  open: true,
  username: "a.ivanova",
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  ...over,
});

const field = () => screen.getByLabelText(/^Password/) as HTMLInputElement;

afterEach(() => clearNotices());

describe("ResetPasswordDialog", () => {
  it("opens holding a generated password that passes the rules, already shown", () => {
    render(<ResetPasswordDialog {...props()} />);
    expect(screen.getByRole("dialog", { name: "New password for a.ivanova" })).toBeInTheDocument();
    expect(field().type).toBe("text");
    expect(validatePassword(field().value)).toBeNull();
  });

  it("replaces the password with a fresh one on Generate", async () => {
    render(<ResetPasswordDialog {...props()} />);
    const first = field().value;
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(field().value).not.toBe(first);
    expect(validatePassword(field().value)).toBeNull();
  });

  it("copies the password on Copy and says so", async () => {
    render(
      <>
        <Toaster />
        <ResetPasswordDialog {...props()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(copyText).toHaveBeenCalledWith(field().value);
    expect(await screen.findByText("Password copied")).toBeInTheDocument();
  });

  it("tells the reader to copy by hand when the clipboard refuses", async () => {
    vi.mocked(copyText).mockResolvedValueOnce(false);
    render(
      <>
        <Toaster />
        <ResetPasswordDialog {...props()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(
      await screen.findByText("Could not copy — select it and copy by hand"),
    ).toBeInTheDocument();
  });

  it("submits the typed password, not the generated one", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordDialog {...props({ onSubmit })} />);
    await userEvent.clear(field());
    await userEvent.type(field(), "Typed-Passw0rd");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(onSubmit).toHaveBeenCalledWith("Typed-Passw0rd");
  });

  it("refuses a weak typed password before the gateway does", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordDialog {...props({ onSubmit })} />);
    await userEvent.clear(field());
    await userEvent.type(field(), "s3cret!!");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText(/Password needs an upper-/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
