import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./model-picker";
import type { Model } from "@/entities/model";

const model = (slug: string, title: string): Model => ({ slug, title, sourceBlobHash: "a" });

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

  it("is a plain single choice when no quantities are given", () => {
    render(<ModelPicker models={MODELS} selectedSlug="pump-jack" onSelect={() => {}} />);
    expect(screen.queryByRole("group", { name: /quantity/i })).not.toBeInTheDocument();
  });
});
