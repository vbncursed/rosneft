import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagMultiSelect, type TagMultiSelectProps } from "./tag-multi-select";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
  { slug: "cranes", title: "Cranes" },
];

const props = (over: Partial<TagMultiSelectProps> = {}): TagMultiSelectProps => ({
  tags: TAGS,
  selected: [],
  atLimit: false,
  max: 2,
  error: null,
  onToggle: vi.fn(),
  onRetry: vi.fn(),
  ...over,
});

describe("TagMultiSelect", () => {
  it("lists every tag as a checkbox and reports a toggle", async () => {
    const onToggle = vi.fn();
    render(<TagMultiSelect {...props({ onToggle })} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Pumps" }));
    expect(onToggle).toHaveBeenCalledWith("pumps");
    expect(screen.getByRole("group", { name: /Tags/ })).toBeInTheDocument();
  });

  it("counts the choice against the limit", () => {
    render(<TagMultiSelect {...props({ selected: ["tanks"] })} />);
    expect(screen.getByText(/1 of 2 chosen/)).toBeInTheDocument();
  });

  it("locks the unchosen at the limit but leaves the chosen free to be unticked", () => {
    render(<TagMultiSelect {...props({ selected: ["tanks", "pumps"], atLimit: true })} />);
    expect(screen.getByRole("checkbox", { name: "Cranes" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Tanks" })).toBeEnabled();
  });

  it("explains an empty list instead of showing a blank group", () => {
    render(<TagMultiSelect {...props({ tags: [] })} />);
    expect(screen.getByText(/No tags are available for zones yet/)).toBeInTheDocument();
  });

  it("says nothing of the sort while the list is still loading", () => {
    render(<TagMultiSelect {...props({ tags: undefined })} />);
    expect(screen.queryByText(/No tags are available/)).not.toBeInTheDocument();
  });

  it("offers no choice and a way to retry when the list failed", async () => {
    const onRetry = vi.fn();
    render(<TagMultiSelect {...props({ tags: undefined, error: "Tags could not be loaded. Try again.", onRetry })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Tags could not be loaded. Try again.");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload tags" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
