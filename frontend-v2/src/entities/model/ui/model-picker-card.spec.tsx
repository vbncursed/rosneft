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
    render(<ModelPickerCard model={MODEL} selected={false} onSelect={onSelect} unavailable />);

    const button = screen.getByRole("button", { name: /Tank 500 · n\/a/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
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
