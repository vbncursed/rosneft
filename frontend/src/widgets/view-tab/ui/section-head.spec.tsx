import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SectionHead } from "./section-head";

describe("SectionHead", () => {
  it("prints the overline and its count", () => {
    render(<SectionHead overline="Panoramas" count="2" />);
    expect(screen.getByText("Panoramas")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("draws no upload button unless one is given", () => {
    render(<SectionHead overline="Panoramas" count="2" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the upload button after what it uploads and anchors the tour", async () => {
    const onClick = vi.fn();
    render(
      <SectionHead
        overline="Panoramas"
        count="2"
        upload={{ title: "Upload a panorama", tourId: "add-panorama", onClick }}
      />,
    );

    const button = screen.getByRole("button", { name: "Upload a panorama" });
    // The shared Button names it in a tooltip; a native title would be a second one.
    expect(button).not.toHaveAttribute("title");
    expect(button).toHaveAttribute("data-tour", "add-panorama");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it("draws the upload button as the shared 24px icon button, with its press", () => {
    render(
      <SectionHead
        overline="Panoramas"
        count="2"
        upload={{ title: "Upload a panorama", tourId: "add-panorama", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload a panorama" })).toHaveClass(
      "size-6",
      "bg-panel-2",
      "enabled:active:scale-95",
    );
  });
});
