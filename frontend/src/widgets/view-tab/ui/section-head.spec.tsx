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

  describe("as a fold", () => {
    const fold = (open: boolean, onToggle = vi.fn(), locked = false) => ({
      open,
      locked,
      onToggle,
      controls: "list-1",
    });

    it("is a button that says whether its list is open and which list it is", () => {
      const { rerender } = render(<SectionHead overline="Panoramas" count="2" fold={fold(false)} />);
      const head = screen.getByRole("button", { name: /Panoramas/ });
      expect(head).toHaveAttribute("aria-expanded", "false");
      expect(head).toHaveAttribute("aria-controls", "list-1");

      rerender(<SectionHead overline="Panoramas" count="2" fold={fold(true)} />);
      expect(head).toHaveAttribute("aria-expanded", "true");
    });

    it("turns the chevron a quarter when open, without motion for reduced-motion readers", () => {
      const { container, rerender } = render(
        <SectionHead overline="Panoramas" count="2" fold={fold(false)} />,
      );
      const chevron = container.querySelector("svg")!;
      expect(chevron).not.toHaveClass("rotate-90");
      expect(chevron).toHaveClass("duration-150", "ease-out", "motion-reduce:transition-none");
      rerender(<SectionHead overline="Panoramas" count="2" fold={fold(true)} />);
      expect(chevron).toHaveClass("rotate-90");
    });

    it("toggles on click, and the upload button beside it does not", async () => {
      const onToggle = vi.fn();
      const onClick = vi.fn();
      render(
        <SectionHead
          overline="Panoramas"
          count="2"
          fold={fold(false, onToggle)}
          upload={{ title: "Upload a panorama", tourId: "add-panorama", onClick }}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Upload a panorama" }));
      expect(onClick).toHaveBeenCalledOnce();
      expect(onToggle).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: /Panoramas/ }));
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it("says a locked head is unavailable, stays focusable, and ignores a click", async () => {
      const onToggle = vi.fn();
      render(<SectionHead overline="Panoramas" count="2" fold={fold(true, onToggle, true)} />);
      const head = screen.getByRole("button", { name: /Panoramas/ });
      expect(head).toHaveAttribute("aria-disabled", "true");
      expect(head).not.toBeDisabled();
      expect(head).toHaveAttribute("aria-expanded", "true");
      await userEvent.click(head);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("brightens on hover only while the reader can press it", () => {
      const { container, rerender } = render(
        <SectionHead overline="Panoramas" count="2" fold={fold(true)} />,
      );
      const chevron = container.querySelector("svg")!;
      expect(screen.getByText("Panoramas")).toHaveClass("group-hover:text-fg");
      expect(chevron).toHaveClass("group-hover:text-fg");

      rerender(<SectionHead overline="Panoramas" count="2" fold={fold(true, vi.fn(), true)} />);
      expect(screen.getByText("Panoramas")).not.toHaveClass("group-hover:text-fg");
      expect(chevron).not.toHaveClass("group-hover:text-fg");
    });

    it("never nests the upload button inside the toggle", () => {
      render(
        <SectionHead
          overline="Panoramas"
          count="2"
          fold={fold(false)}
          upload={{ title: "Upload a panorama", tourId: "add-panorama", onClick: vi.fn() }}
        />,
      );
      const head = screen.getByRole("button", { name: /Panoramas/ });
      expect(head).not.toContainElement(screen.getByRole("button", { name: "Upload a panorama" }));
    });
  });
});
