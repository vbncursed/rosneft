import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CredentialsForm, type CredentialsFormProps } from "./credentials-form";

const props = (over: Partial<CredentialsFormProps> = {}): CredentialsFormProps => ({
  identifier: "",
  onIdentifierChange: vi.fn(),
  password: "",
  onPasswordChange: vi.fn(),
  onSubmit: vi.fn(),
  ...over,
});

describe("CredentialsForm", () => {
  it("is a named form with the two credential fields", () => {
    render(<CredentialsForm {...props()} />);
    expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
  });

  it("reports typing in both fields", async () => {
    const onIdentifierChange = vi.fn();
    const onPasswordChange = vi.fn();
    render(<CredentialsForm {...props({ onIdentifierChange, onPasswordChange })} />);

    await userEvent.type(screen.getByLabelText("Email or username"), "a");
    await userEvent.type(screen.getByLabelText(/^Password/), "b");
    expect(onIdentifierChange).toHaveBeenCalled();
    expect(onPasswordChange).toHaveBeenCalled();
  });

  it("submits on Enter as well as by the button — it is a real form", async () => {
    const onSubmit = vi.fn();
    render(<CredentialsForm {...props({ onSubmit, identifier: "a.ivanova" })} />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await userEvent.type(screen.getByLabelText("Email or username"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("offers the passkey route only where passkeys can work", () => {
    const { rerender } = render(<CredentialsForm {...props()} />);
    expect(screen.queryByRole("button", { name: /passkey/ })).not.toBeInTheDocument();
    expect(screen.queryByText("or password")).not.toBeInTheDocument();

    rerender(<CredentialsForm {...props({ onPasskey: vi.fn() })} />);
    expect(screen.getByRole("button", { name: /Continue with passkey/ })).toBeInTheDocument();
  });

  it("starts the passkey ceremony", async () => {
    const onPasskey = vi.fn();
    render(<CredentialsForm {...props({ onPasskey })} />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with passkey/ }));
    expect(onPasskey).toHaveBeenCalledOnce();
  });

  // A control that claims to limit exposure on a shared machine and does not
  // is worse than no control: the gateway has no such field. It is drawn only
  // where something is listening, exactly like the passkey button above.
  it("offers the remember-me choice only where something acts on it", async () => {
    const onRememberChange = vi.fn();
    const { rerender } = render(<CredentialsForm {...props()} />);
    expect(screen.queryByRole("checkbox", { name: /Keep me signed in/ })).not.toBeInTheDocument();

    rerender(<CredentialsForm {...props({ remember: false, onRememberChange })} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Keep me signed in/ }));
    expect(onRememberChange).toHaveBeenCalledWith(true);
  });

  it("announces a rejected identifier against the field", () => {
    render(<CredentialsForm {...props({ error: "Invalid username or password." })} />);
    expect(screen.getByLabelText("Email or username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid username or password.");
  });

  it("freezes every control while the request is in flight", () => {
    render(
      <CredentialsForm
        {...props({ submitting: true, onPasskey: vi.fn(), onRememberChange: vi.fn() })}
      />,
    );
    expect(screen.getByLabelText("Email or username")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Continue with passkey/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Keep me signed in/ })).toBeDisabled();
  });
});
