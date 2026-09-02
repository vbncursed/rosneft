import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TerritoryCard } from "./territory-card";
import type { Territory } from "../model/territory";

const TERRITORY: Territory = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  description: "Distillation towers, tank farm, and pipe racks for Block C.",
  sourceBlobHash: "abc123",
};

describe("TerritoryCard", () => {
  it("links a ready territory to its viewer route", () => {
    render(<TerritoryCard territory={TERRITORY} conversion={{ status: "ready" }} />);
    expect(screen.getByRole("link", { name: "Refinery Block C" })).toHaveAttribute(
      "href",
      "/territories/refinery-block-c",
    );
    expect(screen.getByText("Open →")).toBeInTheDocument();
  });

  it("offers no link while the scene is still converting", () => {
    render(
      <TerritoryCard territory={TERRITORY} conversion={{ status: "converting", progress: 42 }} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("converting")).toBeInTheDocument();
  });

  it("offers no link and no note after a failed conversion", () => {
    render(<TerritoryCard territory={TERRITORY} conversion={{ status: "failed" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.queryByText("Open →")).not.toBeInTheDocument();
  });

  it("shows actions instead of the status badge", () => {
    render(
      <TerritoryCard
        territory={TERRITORY}
        conversion={{ status: "ready" }}
        actions={<button type="button">Delete</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
  });

  it("carries the description through, and copes without one", () => {
    const { rerender } = render(
      <TerritoryCard territory={TERRITORY} conversion={{ status: "ready" }} />,
    );
    expect(screen.getByText(/Distillation towers/)).toBeInTheDocument();

    rerender(
      <TerritoryCard
        territory={{ ...TERRITORY, description: undefined }}
        conversion={{ status: "ready" }}
      />,
    );
    expect(screen.queryByText(/Distillation towers/)).not.toBeInTheDocument();
  });
});
