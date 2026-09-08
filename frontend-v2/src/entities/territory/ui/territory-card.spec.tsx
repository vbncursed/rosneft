import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TerritoryCardModel } from "../model/territory-card";
import { TerritoryCard } from "./territory-card";

const card = (over: Partial<TerritoryCardModel> = {}): TerritoryCardModel => ({
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  status: "ready",
  chips: [{ label: "3 placements", tone: "plain" }],
  trailing: { label: "Open →", tone: "accent" },
  panorama: false,
  ...over,
});

describe("TerritoryCard", () => {
  it("links the title to the href and names the article after the territory", () => {
    render(<TerritoryCard card={card()} href="/territories/north-ridge-pad" />);
    expect(screen.getByRole("link", { name: "North Ridge Pad" })).toHaveAttribute("href", "/territories/north-ridge-pad");
    expect(screen.getByRole("article", { name: "North Ridge Pad" })).toBeInTheDocument();
  });

  it("badges ready, converting and failed; a pending card wears no badge", () => {
    const { rerender } = render(<TerritoryCard card={card()} href="#" />);
    expect(screen.getByText("ready")).toBeInTheDocument();
    rerender(<TerritoryCard card={card({ status: "converting", trailing: { label: "converting", tone: "muted" } })} href="#" />);
    // The badge over the thumbnail and the trailing label both read "converting".
    expect(screen.getAllByText("converting")).toHaveLength(2);
    rerender(<TerritoryCard card={card({ status: "failed", trailing: { label: "unavailable", tone: "muted" } })} href="#" />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    rerender(<TerritoryCard card={card({ status: "pending", trailing: { label: "pending", tone: "muted" } })} href="#" />);
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  it("opens on a whole-card click and keeps the actions out of it", async () => {
    const onOpen = vi.fn();
    const onAct = vi.fn();
    render(
      <TerritoryCard card={card()} href="#" onOpen={onOpen} actions={<button type="button" onClick={onAct}>Delete</button>} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onAct).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("article"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("draws the progress bar and stage while converting", () => {
    render(<TerritoryCard card={card({ status: "converting", progress: { value: 62, stage: "Compressing textures" }, trailing: { label: "converting", tone: "muted" } })} href="#" />);
    expect(screen.getByRole("progressbar", { name: "Compressing textures" })).toHaveAttribute("aria-valuenow", "62");
  });
});
