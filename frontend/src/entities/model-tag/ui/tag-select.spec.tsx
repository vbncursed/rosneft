import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagSelect } from "./tag-select";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "ungrouped", title: "Ungrouped" },
];

const trigger = (name: string | RegExp = /Tag/) => screen.getByRole("button", { name });
const open = (name?: string | RegExp) => userEvent.click(trigger(name));

describe("TagSelect", () => {
  it("lists every tag by title once opened", async () => {
    render(<TagSelect tags={TAGS} value="tanks" onChange={() => {}} />);
    await open();
    expect(screen.getByRole("option", { name: "Tanks" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ungrouped" })).toBeInTheDocument();
  });

  it("shows the placeholder while nothing is chosen, and it cannot be picked", async () => {
    const onChange = vi.fn();
    render(<TagSelect tags={TAGS} value={null} onChange={onChange} />);
    expect(trigger()).toHaveTextContent("Choose a tag");
    await open();
    await userEvent.click(screen.getByRole("option", { name: "Choose a tag" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("marks the field required", () => {
    render(<TagSelect tags={TAGS} value={null} onChange={() => {}} />);
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the chosen tag", () => {
    render(<TagSelect tags={TAGS} value="ungrouped" onChange={() => {}} />);
    expect(trigger()).toHaveTextContent("Ungrouped");
  });

  it("reports the slug of the picked tag", async () => {
    const onChange = vi.fn();
    render(<TagSelect tags={TAGS} value={null} onChange={onChange} />);
    await open();
    await userEvent.click(screen.getByRole("option", { name: "Tanks" }));
    expect(onChange).toHaveBeenCalledWith("tanks");
  });

  it("is disabled while the list loads, showing only the placeholder", () => {
    render(<TagSelect tags={undefined} value={null} onChange={() => {}} />);
    expect(trigger()).toBeDisabled();
    expect(trigger()).toHaveTextContent("Choose a tag");
  });

  it("is disabled on request", () => {
    render(<TagSelect tags={TAGS} value="tanks" onChange={() => {}} disabled />);
    expect(trigger()).toBeDisabled();
  });

  it("describes the control with its error", () => {
    render(
      <TagSelect tags={undefined} value={null} onChange={() => {}} error="Tags could not be loaded. Try again." />,
    );
    expect(trigger()).toBeInvalid();
    expect(trigger()).toHaveAccessibleDescription("Tags could not be loaded. Try again.");
  });

  it("takes the caller's label", () => {
    render(<TagSelect tags={TAGS} value="tanks" onChange={() => {}} label="Change tag" />);
    expect(trigger("Change tag")).toBeInTheDocument();
  });
});
