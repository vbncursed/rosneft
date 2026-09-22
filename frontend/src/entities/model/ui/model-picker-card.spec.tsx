import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPickerCard } from "./model-picker-card";
import type { Model } from "../model/model";

const MODEL: Model = { slug: "storage-tank-500", title: "Tank 500", sourceBlobHash: "a", usageCount: 0 };

describe("ModelPickerCard", () => {
  it("reports its selection state through aria-pressed", () => {
    const { rerender } = render(
      <ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /Tank 500/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(<ModelPickerCard model={MODEL} selected onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Tank 500/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(<ModelPickerCard model={MODEL} selected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Tank 500/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("cannot be picked while unavailable, and says why in its label", async () => {
    const onSelect = vi.fn();
    render(
      <ModelPickerCard
        model={MODEL}
        selected={false}
        onSelect={onSelect}
        unavailable
        meta="Not converted yet"
      />,
    );

    const button = screen.getByRole("button", { name: /Tank 500.*Not converted yet/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // The whole card at 45% opacity put its own reason below 2:1; the reason
  // prints at full strength and the title steps down to dim instead.
  it("keeps an unavailable card legible rather than fading it", () => {
    const { container } = render(
      <ModelPickerCard
        model={MODEL}
        selected={false}
        onSelect={() => {}}
        unavailable
        meta="Not converted yet"
      />,
    );
    expect(container.querySelector('[class*="opacity-"]')).toBeNull();
    expect(screen.getByText("Tank 500").parentElement).toHaveClass("text-dim");
    expect(screen.getByText("Not converted yet")).toHaveClass("text-muted");
  });

  // overflow-hidden on the card clipped an outset ring entirely.
  it("draws its focus ring inside the card and presses when it can be picked", () => {
    const { container, rerender } = render(
      <ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} />,
    );
    const button = screen.getByRole("button", { name: /Tank 500/ });
    expect(button).toHaveClass("focus-visible:outline-offset-[-2px]");
    expect(button).not.toHaveClass("focus-visible:outline-offset-2");
    const card = container.firstElementChild!;
    expect(card).toHaveClass("active:scale-[0.97]", "transition-[color,background-color,border-color,scale]");
    expect(card).not.toHaveClass("transition-colors");

    rerender(<ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} unavailable />);
    expect(container.firstElementChild).not.toHaveClass("active:scale-[0.97]");
  });

  it("shows a quantity stepper only once selected", async () => {
    const onQuantityChange = vi.fn();
    const { rerender } = render(
      <ModelPickerCard
        model={MODEL}
        selected={false}
        onSelect={() => {}}
        quantity={3}
        onQuantityChange={onQuantityChange}
      />,
    );
    expect(screen.queryByRole("group", { name: /quantity/ })).not.toBeInTheDocument();

    rerender(
      <ModelPickerCard
        model={MODEL}
        selected
        onSelect={() => {}}
        quantity={3}
        onQuantityChange={onQuantityChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Increase tank 500 quantity/i }));
    expect(onQuantityChange).toHaveBeenCalledWith(4);
  });

  it("keeps the title on one line — a long name must not make its card taller than its row", () => {
    const long = { ...MODEL, title: "500 BBL Oil Storage Tank_Frac Tank" };
    render(<ModelPickerCard model={long} selected={false} onSelect={() => {}} />);
    const title = screen.getByText("500 BBL Oil Storage Tank_Frac Tank");
    expect(title).toHaveClass("truncate");
    expect(title).toHaveAttribute("title", "500 BBL Oil Storage Tank_Frac Tank");
  });

  it("prints the meta line under the title when it is given", () => {
    const { rerender } = render(
      <ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} />,
    );
    expect(screen.queryByText("3 LODs · 8.0 MB")).not.toBeInTheDocument();

    rerender(
      <ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} meta="3 LODs · 8.0 MB" />,
    );
    expect(screen.getByText("3 LODs · 8.0 MB")).toBeInTheDocument();
  });

  it("keeps the square thumb by default and takes the 74px band on request", () => {
    const thumb = () => document.querySelector("button > span")!;

    const { rerender } = render(
      <ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} />,
    );
    expect(thumb().className).toContain("aspect-square");
    expect(thumb().className).not.toContain("h-[74px]");

    rerender(<ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} thumb="band" />);
    expect(thumb().className).toContain("h-[74px]");
    expect(thumb().className).not.toContain("aspect-square");
  });

  it("renders the thumbnail when the model has one", () => {
    render(
      <ModelPickerCard
        model={{ ...MODEL, thumbnailBlobHash: "deadbeef" }}
        selected={false}
        onSelect={() => {}}
      />,
    );
    // Decorative: the button's text already names the model.
    const img = document.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/api/assets/deadbeef");
    expect(img).toHaveAttribute("alt", "");
  });

  it("falls back to the cube glyph without a thumbnail", () => {
    render(<ModelPickerCard model={MODEL} selected={false} onSelect={() => {}} />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).toBeInTheDocument();
  });
});

describe("ModelPickerCard · selected badge", () => {
  it("draws the selected badge as a check icon, not a ✓ character", () => {
    const svgs = (selected: boolean) => {
      const { container, unmount } = render(
        <ModelPickerCard model={MODEL} selected={selected} onSelect={() => {}} />,
      );
      const count = container.querySelectorAll("svg").length;
      expect(container).not.toHaveTextContent("✓");
      unmount();
      return count;
    };
    expect(svgs(true)).toBe(svgs(false) + 1);
  });
});
