import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ModelCardModel } from "../model/model-card";
import { ModelCard } from "./model-card";

const card = (over: Partial<ModelCardModel> = {}): ModelCardModel => ({
  slug: "pump-jack-unit",
  title: "Pump Jack Unit",
  status: "ready",
  thumbnailUrl: null,
  usageCount: 6,
  size: "38 MB",
  lods: "LOD 0-2",
  trailing: { label: "in 6 territories", tone: "accent" },
  ...over,
});

describe("ModelCard", () => {
  it("links the title, prints the slug and the trailing note", () => {
    render(<ModelCard card={card()} href="/models/pump-jack-unit" />);
    expect(screen.getByRole("link", { name: "Pump Jack Unit" })).toHaveAttribute("href", "/models/pump-jack-unit");
    expect(screen.getByText("pump-jack-unit")).toBeInTheDocument();
    expect(screen.getByText("in 6 territories")).toBeInTheDocument();
  });

  it("draws the size only when handed as meta", () => {
    const { rerender } = render(<ModelCard card={card()} href="#" />);
    expect(screen.queryByText("38 MB")).not.toBeInTheDocument();
    rerender(<ModelCard card={card()} href="#" meta="38 MB" />);
    expect(screen.getByText("38 MB")).toBeInTheDocument();
  });

  it("says no image without a thumbnail and draws the image with one", () => {
    const { rerender, container } = render(<ModelCard card={card()} href="#" />);
    expect(screen.getByText("no image")).toBeInTheDocument();
    rerender(<ModelCard card={card({ thumbnailUrl: "/api/assets/abc" })} href="#" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/assets/abc");
  });

  it("badges only a converting or failed model", () => {
    const { rerender } = render(<ModelCard card={card()} href="#" />);
    expect(screen.queryByText("converting")).not.toBeInTheDocument();
    rerender(<ModelCard card={card({ status: "failed", trailing: { label: "unavailable", tone: "bad" } })} href="#" />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
