import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagCard, type TagCardProps } from "./tag-card";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
];

const props = (over: Partial<TagCardProps> = {}): TagCardProps => ({
  tag: TAGS[0],
  tags: TAGS,
  tagsError: null,
  canWrite: true,
  busy: false,
  onTag: vi.fn(),
  ...over,
});

describe("TagCard", () => {
  it("shows the model's tag as a chip", () => {
    render(<TagCard {...props({ canWrite: false })} />);
    expect(screen.getByText("Tanks")).toBeInTheDocument();
  });

  it("is read-only without model:write", () => {
    render(<TagCard {...props({ canWrite: false })} />);
    expect(screen.queryByRole("button", { name: "Change tag" })).not.toBeInTheDocument();
  });

  it("offers Change tag with model:write, and reports the pick", async () => {
    const onTag = vi.fn();
    render(<TagCard {...props({ onTag })} />);
    const select = screen.getByRole("button", { name: "Change tag" });
    expect(select).toHaveTextContent("Tanks");
    await userEvent.click(select);
    await userEvent.click(screen.getByRole("option", { name: "Pumps" }));
    expect(onTag).toHaveBeenCalledWith("pumps");
  });

  it("locks the control while a save is in flight", () => {
    render(<TagCard {...props({ busy: true })} />);
    expect(screen.getByRole("button", { name: "Change tag" })).toBeDisabled();
  });

  it("says so when the tag list could not be loaded", () => {
    render(<TagCard {...props({ tags: undefined, tagsError: "Tags could not be loaded. Try again." })} />);
    expect(screen.getByRole("button", { name: "Change tag" })).toHaveAccessibleDescription(
      "Tags could not be loaded. Try again.",
    );
  });
});
