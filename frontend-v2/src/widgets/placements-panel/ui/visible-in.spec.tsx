import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VISIBLE_IN, VISIBLE_IN_NOTE } from "../model/panel-copy";
import { VisibleIn } from "./visible-in";

const PANORAMAS = [
  { id: 1, title: "Control room, north door" },
  { id: 2, title: "Tank yard, west gate" },
];

describe("VisibleIn", () => {
  it("checks every panorama the placement is visible in and prints the note", () => {
    render(
      <VisibleIn
        placement={{ id: 3, visiblePanoramaIds: [1] }}
        panoramas={PANORAMAS}
        pending={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText(VISIBLE_IN)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Control room, north door" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tank yard, west gate" })).not.toBeChecked();
    expect(screen.getByText(VISIBLE_IN_NOTE)).toBeInTheDocument();
  });

  it("tones a checked panorama's label fg and an unchecked one muted", () => {
    render(
      <VisibleIn
        placement={{ id: 3, visiblePanoramaIds: [1] }}
        panoramas={PANORAMAS}
        pending={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Control room, north door")).toHaveClass("text-fg");
    expect(screen.getByText("Tank yard, west gate")).toHaveClass("text-muted");
  });

  it("reports a toggle with the panorama id and the next state", async () => {
    const onToggle = vi.fn();
    render(
      <VisibleIn
        placement={{ id: 3, visiblePanoramaIds: [1] }}
        panoramas={PANORAMAS}
        pending={false}
        onToggle={onToggle}
      />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Tank yard, west gate" }));
    expect(onToggle).toHaveBeenCalledWith(2, true);

    await userEvent.click(screen.getByRole("checkbox", { name: "Control room, north door" }));
    expect(onToggle).toHaveBeenCalledWith(1, false);
  });

  it("disables every checkbox while pending", () => {
    render(
      <VisibleIn
        placement={{ id: 3, visiblePanoramaIds: [] }}
        panoramas={PANORAMAS}
        pending
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Control room, north door" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Tank yard, west gate" })).toBeDisabled();
  });
});
