import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ModelCardModel } from "@/entities/model";
import { ModelsSection } from "./models-section";

const card = (slug: string): ModelCardModel => ({
  slug,
  title: slug,
  status: "ready",
  thumbnailUrl: null,
  usageCount: 2,
  size: "12 MB",
  lods: "3 LODs",
  trailing: { label: "in 2 territories", tone: "accent" },
});

describe("ModelsSection", () => {
  it("draws the see-all link whenever the list is non-empty", () => {
    const { rerender } = render(
      <ModelsSection cards={[card("a")]} total={1} meta="1 in the library" onOpen={vi.fn()} />,
    );
    expect(screen.getByRole("link", { name: "See all 1 models →" })).toHaveAttribute(
      "href",
      "/models",
    );

    rerender(<ModelsSection cards={[]} total={0} meta="none yet" onOpen={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /See all/ })).not.toBeInTheDocument();
  });

  it("links every card to its model page, without the library's size text, and opens on a click", async () => {
    const onOpen = vi.fn();
    render(
      <ModelsSection cards={[card("valve-assembly")]} total={1} meta="1 in the library" onOpen={onOpen} />,
    );
    expect(screen.getByRole("link", { name: "valve-assembly" })).toHaveAttribute(
      "href",
      "/models/valve-assembly",
    );
    expect(screen.queryByText("12 MB")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("article"));
    expect(onOpen).toHaveBeenCalledWith("/models/valve-assembly");
  });

  it("says the library is empty", () => {
    render(<ModelsSection cards={[]} total={0} meta="none yet" onOpen={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Models" })).toBeInTheDocument();
    expect(screen.getByText("The library is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Models uploaded here can be placed on any territory."),
    ).toBeInTheDocument();
  });
});
