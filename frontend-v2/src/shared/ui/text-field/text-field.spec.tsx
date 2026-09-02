import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./text-field";
import { Textarea } from "./textarea";

describe("TextField", () => {
  it("ties the label to the input", async () => {
    render(<TextField label="Title" />);
    await userEvent.type(screen.getByLabelText(/Title/), "Refinery");
    expect(screen.getByLabelText(/Title/)).toHaveValue("Refinery");
  });

  it("describes the input with its hint", () => {
    render(<TextField label="Title" hint="Shown in the catalog" />);
    expect(screen.getByLabelText(/Title/)).toHaveAccessibleDescription("Shown in the catalog");
  });

  it("marks an errored input invalid and announces the message", () => {
    render(<TextField label="Email" error="Enter a valid address" />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid address");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid address");
  });

  it("prefers the error over the hint as the description", () => {
    render(<TextField label="Email" hint="Work address" error="Enter a valid address" />);
    expect(screen.getByLabelText(/Email/)).toHaveAccessibleDescription("Enter a valid address");
    expect(screen.queryByText("Work address")).not.toBeInTheDocument();
  });

  it("does not accept typing while disabled", async () => {
    const onChange = vi.fn();
    render(<TextField label="Company" disabled defaultValue="Locked" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/Company/), "x");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Company/)).toHaveValue("Locked");
  });

  it("switches to the mono face for slugs", () => {
    render(<TextField label="Slug" mono />);
    expect(screen.getByLabelText(/Slug/).className).toContain("font-mono");
  });

  it("keeps distinct ids for two unlabelled-by-hand fields", () => {
    render(
      <>
        <TextField label="One" />
        <TextField label="Two" />
      </>,
    );
    expect(screen.getByLabelText("One").id).not.toBe(screen.getByLabelText("Two").id);
  });
});

describe("Textarea", () => {
  it("takes multiline input and defaults to three rows", async () => {
    render(<Textarea label="Description" />);
    const box = screen.getByLabelText(/Description/);
    expect(box).toHaveAttribute("rows", "3");
    await userEvent.type(screen.getByLabelText(/Description/), "Tank farm");
    expect(box).toHaveValue("Tank farm");
  });
});
