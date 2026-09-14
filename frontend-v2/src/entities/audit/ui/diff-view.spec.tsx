import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView } from "./diff-view";

describe("DiffView", () => {
  it("shows a changed field as before → after", () => {
    render(<DiffView before={{ position_x: 8.2 }} after={{ position_x: 12.4 }} />);
    expect(screen.getByText("position_x")).toBeInTheDocument();
    expect(screen.getByText("8.2")).toHaveClass("line-through");
    expect(screen.getByText("12.4")).toHaveClass("text-fg");
  });

  it("shows an added field in the success tone with no strike-through", () => {
    render(<DiffView before={{}} after={{ label: "Pump Jack A2" }} />);
    const value = screen.getByText('"Pump Jack A2"');
    expect(value).toHaveClass("text-ok");
    expect(value).not.toHaveClass("line-through");
  });

  it("strikes a removed field through", () => {
    render(<DiffView before={{ visible_panorama_ids: [4, 7] }} after={{}} />);
    const value = screen.getByText("[4,7]");
    expect(value).toHaveClass("text-bad");
    expect(value).toHaveClass("line-through");
  });

  it("colours the field name by what happened to it", () => {
    render(
      <DiffView
        before={{ removed_field: 1, changed_field: 1 }}
        after={{ changed_field: 2, added_field: 1 }}
      />,
    );
    expect(screen.getByText("added_field")).toHaveClass("text-ok");
    expect(screen.getByText("removed_field")).toHaveClass("text-bad");
    expect(screen.getByText("changed_field")).toHaveClass("text-accent");
  });

  it("says so plainly when nothing but ignored fields moved", () => {
    render(<DiffView before={{ updated_at: "a" }} after={{ updated_at: "b" }} />);
    expect(screen.getByText("No field-level changes recorded.")).toBeInTheDocument();
  });

  it("pairs each field name with its value as a description list", () => {
    const { container } = render(<DiffView before={{ a: 1 }} after={{ a: 2 }} />);
    expect(container.querySelectorAll("dt")).toHaveLength(1);
    expect(container.querySelectorAll("dd")).toHaveLength(1);
  });
});
