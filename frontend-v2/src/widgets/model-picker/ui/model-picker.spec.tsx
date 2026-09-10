import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./model-picker";
import type { Model } from "@/entities/model";

const model = (slug: string, title: string): Model => ({ slug, title, sourceBlobHash: "a", usageCount: 0 });

const MODELS = [
  { model: model("pump-jack", "Pump Jack") },
  { model: model("storage-tank-500", "Tank 500") },
  { model: model("flare-stack", "Flare"), unavailable: true },
];

describe("ModelPicker", () => {
  it("lists every model in the library", () => {
    render(<ModelPicker models={MODELS} selectedSlug={null} onSelect={() => {}} />);
    expect(screen.getByRole("list", { name: "Models" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says the library is empty rather than showing a blank grid", () => {
    render(<ModelPicker models={[]} selectedSlug={null} onSelect={() => {}} />);
    expect(screen.getByText("No models in the library yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("selects by slug", async () => {
    const onSelect = vi.fn();
    render(<ModelPicker models={MODELS} selectedSlug={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Tank 500/ }));
    expect(onSelect).toHaveBeenCalledWith("storage-tank-500");
  });

  it("marks the selected model", () => {
    render(<ModelPicker models={MODELS} selectedSlug="pump-jack" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Pump Jack/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("refuses a model that cannot be placed yet", async () => {
    const onSelect = vi.fn();
    render(<ModelPicker models={MODELS} selectedSlug={null} onSelect={onSelect} />);
    const unavailable = screen.getByRole("button", { name: /Flare · n\/a/ });
    expect(unavailable).toBeDisabled();
    await userEvent.click(unavailable);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reports a quantity change against the right model", async () => {
    const onQuantityChange = vi.fn();
    render(
      <ModelPicker
        models={MODELS}
        selectedSlug="storage-tank-500"
        onSelect={() => {}}
        quantities={{ "storage-tank-500": 3 }}
        onQuantityChange={onQuantityChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Increase tank 500 quantity/i }));
    expect(onQuantityChange).toHaveBeenCalledWith("storage-tank-500", 4);
  });

  it("passes each model's meta line through to its card", () => {
    render(
      <ModelPicker
        models={[{ model: model("pump-jack", "Pump Jack"), meta: "3 LODs · 8.0 MB" }]}
        selectedSlug={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("3 LODs · 8.0 MB")).toBeInTheDocument();
  });

  it("passes the thumb shape through to its cards", () => {
    render(
      <ModelPicker models={MODELS} selectedSlug={null} onSelect={() => {}} thumb="band" />,
    );
    expect(document.querySelector("button > span")!.className).toContain("h-[74px]");
  });

  it("draws four columns when the caller asks for them", () => {
    const { rerender } = render(
      <ModelPicker models={MODELS} selectedSlug={null} onSelect={() => {}} />,
    );
    expect(screen.getByRole("list", { name: "Models" }).className).toContain("grid-cols-3");

    rerender(<ModelPicker models={MODELS} selectedSlug={null} onSelect={() => {}} columns={4} />);
    const grid = screen.getByRole("list", { name: "Models" });
    expect(grid.className).toContain("grid-cols-4");
    expect(grid.className).not.toContain("grid-cols-3");
  });

  it("is a plain single choice when no quantities are given", () => {
    render(<ModelPicker models={MODELS} selectedSlug="pump-jack" onSelect={() => {}} />);
    expect(screen.queryByRole("group", { name: /quantity/i })).not.toBeInTheDocument();
  });
});
