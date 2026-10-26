import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagSelect } from "./tag-select";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "ungrouped", title: "Ungrouped" },
];

describe("TagSelect", () => {
  it("lists every tag by title", () => {
    render(<TagSelect tags={TAGS} value="tanks" onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "Tanks" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ungrouped" })).toBeInTheDocument();
  });

  it("selects the placeholder while nothing is chosen", () => {
    render(<TagSelect tags={TAGS} value={null} onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "Choose a tag" })).toHaveProperty("selected", true);
    expect(screen.getByRole("combobox", { name: /Tag/ })).toBeRequired();
  });

  it("shows the chosen tag", () => {
    render(<TagSelect tags={TAGS} value="ungrouped" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("ungrouped");
  });

  it("reports the slug of the picked tag", async () => {
    const onChange = vi.fn();
    render(<TagSelect tags={TAGS} value={null} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "Tanks");
    expect(onChange).toHaveBeenCalledWith("tanks");
  });

  it("is disabled while the list loads, with only the placeholder to show", () => {
    render(<TagSelect tags={undefined} value={null} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("is disabled on request", () => {
    render(<TagSelect tags={TAGS} value="tanks" onChange={() => {}} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("describes the control with its error", () => {
    render(
      <TagSelect tags={undefined} value={null} onChange={() => {}} error="Tags could not be loaded. Try again." />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeInvalid();
    expect(select).toHaveAccessibleDescription("Tags could not be loaded. Try again.");
  });

  it("takes the caller's label", () => {
    render(<TagSelect tags={TAGS} value="tanks" onChange={() => {}} label="Change tag" />);
    expect(screen.getByRole("combobox", { name: "Change tag" })).toBeInTheDocument();
  });
});
