import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("ties its label to the box and takes multiline input", async () => {
    render(<Textarea label="Description" />);
    await userEvent.type(screen.getByLabelText("Description"), "Tank farm{enter}Pipe racks");
    expect(screen.getByLabelText("Description")).toHaveValue("Tank farm\nPipe racks");
  });

  it("defaults to three rows and takes an override", () => {
    const { rerender } = render(<Textarea label="Description" />);
    expect(screen.getByLabelText("Description")).toHaveAttribute("rows", "3");

    rerender(<Textarea label="Description" rows={8} />);
    expect(screen.getByLabelText("Description")).toHaveAttribute("rows", "8");
  });

  it("stays vertically resizable, never horizontally", () => {
    render(<Textarea label="Description" />);
    expect(screen.getByLabelText("Description").className).toContain("resize-y");
  });

  it("describes itself with its hint", () => {
    render(<Textarea label="Description" hint="Markdown is not rendered" />);
    expect(screen.getByLabelText("Description")).toHaveAccessibleDescription(
      "Markdown is not rendered",
    );
  });

  it("marks itself invalid and announces the error", () => {
    render(<Textarea label="Description" error="Too long" />);
    expect(screen.getByLabelText("Description")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Too long");
  });

  it("takes no input while disabled", async () => {
    const onChange = vi.fn();
    render(<Textarea label="Description" disabled onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Description"), "x");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps distinct ids for two boxes", () => {
    render(
      <>
        <Textarea label="One" />
        <Textarea label="Two" />
      </>,
    );
    expect(screen.getByLabelText("One").id).not.toBe(screen.getByLabelText("Two").id);
  });
});
