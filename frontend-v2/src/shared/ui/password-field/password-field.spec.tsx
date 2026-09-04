import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordField } from "./password-field";

const input = () => screen.getByLabelText(/Password/) as HTMLInputElement;

describe("PasswordField", () => {
  it("masks the value until the toggle is pressed", async () => {
    render(<PasswordField label="Password" defaultValue="passwordvalue" />);
    expect(input()).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input()).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input()).toHaveAttribute("type", "password");
  });

  it("reports toggle state through aria-pressed", async () => {
    render(<PasswordField label="Password" />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the typed value across a toggle", async () => {
    render(<PasswordField label="Password" />);
    await userEvent.type(input(), "Kf7-tundra-halo");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input()).toHaveValue("Kf7-tundra-halo");
  });

  it("shows a label action only when one is given", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<PasswordField label="Password" />);
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();

    rerender(<PasswordField label="Password" action={{ label: "Generate", onClick }} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps that action out of the field's accessible name", () => {
    render(<PasswordField label="Password" action={{ label: "Forgot?", onClick: () => {} }} />);
    // Inside the <label> it would read as "Password Forgot?" and clicking it
    // would also focus the input.
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("announces a validation error", () => {
    render(<PasswordField label="New password" error="At least 12 characters" />);
    expect(screen.getByLabelText(/New password/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("At least 12 characters");
  });

  it("disables both the input and its toggle", () => {
    render(<PasswordField label="Password" disabled />);
    expect(input()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show password" })).toBeDisabled();
  });

  it("keeps the same line-height shown and hidden, so the field does not jump", async () => {
    render(<PasswordField label="Password" defaultValue="x" />);
    expect(input().className).toContain("text-sm"); // text-sm carries the same 20px line-height

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input().className).toContain("leading-5");
  });
});
