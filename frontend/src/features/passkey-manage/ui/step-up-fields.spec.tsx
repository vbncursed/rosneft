import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepUpFields } from "./step-up-fields";

describe("StepUpFields", () => {
  it("reports { password } once something is typed, null again when cleared", async () => {
    const onChange = vi.fn();
    render(<StepUpFields factor="password" onChange={onChange} />);
    const field = screen.getByLabelText("Account password");
    await userEvent.type(field, "pw");
    expect(onChange).toHaveBeenLastCalledWith({ password: "pw" });
    await userEvent.clear(field);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("reports { code } only when all six digits are in", async () => {
    const onChange = vi.fn();
    render(<StepUpFields factor="code" onChange={onChange} />);
    for (let i = 0; i < 5; i++) await userEvent.type(screen.getByLabelText(`Digit ${i + 1} of 6`), "1");
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.type(screen.getByLabelText("Digit 6 of 6"), "1");
    expect(onChange).toHaveBeenLastCalledWith({ code: "111111" });
  });

  it("takes a trimmed recovery code instead", async () => {
    const onChange = vi.fn();
    render(<StepUpFields factor="code" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.type(screen.getByLabelText("Recovery code"), " abcde-12345 ");
    expect(onChange).toHaveBeenLastCalledWith({ code: "abcde-12345" });
  });
});
