import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { validatePassword } from "@/entities/user";
import { PasswordSection } from "./password-section";

const currentField = () => screen.getByLabelText("Current password") as HTMLInputElement;
const newField = () => screen.getByLabelText("New password") as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: "Change password" });

describe("PasswordSection", () => {
  it("shows no error on an empty new field — never greet the user with a red box", () => {
    render(<PasswordSection busy={false} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the validator's message once a weak new password is typed, and disables submit", async () => {
    render(<PasswordSection busy={false} onSubmit={vi.fn()} />);
    await userEvent.type(currentField(), "old-pass");
    await userEvent.type(newField(), "short");
    expect(screen.getByRole("alert")).toHaveTextContent(validatePassword("short")!);
    expect(submit()).toBeDisabled();
  });

  it("fills the new field with Generate, which passes validation and is revealed", async () => {
    render(<PasswordSection busy={false} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(newField()).toHaveAttribute("type", "text");
    expect(validatePassword(newField().value)).toBeNull();
  });

  it("disables submit until both fields are filled and valid", async () => {
    render(<PasswordSection busy={false} onSubmit={vi.fn()} />);
    expect(submit()).toBeDisabled();
    await userEvent.type(currentField(), "old-pass");
    expect(submit()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(submit()).toBeEnabled();
  });

  it("disables submit while busy", async () => {
    render(<PasswordSection busy onSubmit={vi.fn()} />);
    await userEvent.type(currentField(), "old-pass");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(submit()).toBeDisabled();
  });

  it("submits current and next, then clears both fields", async () => {
    const onSubmit = vi.fn();
    render(<PasswordSection busy={false} onSubmit={onSubmit} />);
    await userEvent.type(currentField(), "old-pass");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    const generated = newField().value;
    await userEvent.click(submit());

    expect(onSubmit).toHaveBeenCalledWith("old-pass", generated);
    expect(currentField().value).toBe("");
    expect(newField().value).toBe("");
  });
});
