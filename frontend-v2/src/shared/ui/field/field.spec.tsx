import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./field";

describe("Field", () => {
  it("ties its label to the control it wraps", () => {
    render(
      <Field id="title" label="Title">
        <input id="title" />
      </Field>,
    );
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });

  it("renders without a label at all", () => {
    render(
      <Field id="bare">
        <input id="bare" aria-label="Bare" />
      </Field>,
    );
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Bare")).toBeInTheDocument();
  });

  it("marks a required field with an asterisk hidden from screen readers", () => {
    render(
      <Field id="title" label="Title" required>
        <input id="title" required />
      </Field>,
    );
    // The visible label reads "Title *", but the * is decorative — `required`
    // on the control is what assistive tech actually reports.
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText(/Title/)).toBeRequired();
  });

  it("shows the hint under the control", () => {
    render(
      <Field id="title" label="Title" hint="Shown in the catalog">
        <input id="title" />
      </Field>,
    );
    const hint = screen.getByText("Shown in the catalog");
    expect(hint).toHaveAttribute("id", "title-hint");
  });

  it("announces an error and drops the hint entirely", () => {
    render(
      <Field id="email" label="Email" hint="Work address" error="Enter a valid address">
        <input id="email" />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a valid address");
    expect(alert).toHaveAttribute("id", "email-error");
    expect(screen.queryByText("Work address")).not.toBeInTheDocument();
  });

  it("dims the label when the control is disabled", () => {
    const { rerender } = render(
      <Field id="company" label="Company">
        <input id="company" />
      </Field>,
    );
    expect(screen.getByText("Company").className).toContain("text-muted");

    rerender(
      <Field id="company" label="Company" disabled>
        <input id="company" />
      </Field>,
    );
    expect(screen.getByText("Company").className).toContain("text-dim");
  });
});
