import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CatalogCard } from "./catalog-card";

describe("CatalogCard", () => {
  it("draws the badge, chips, slug and trailing note", () => {
    render(
      <CatalogCard
        title="North Ridge Pad"
        slug="north-ridge-pad"
        description="Wellhead cluster."
        badge={{ label: "ready", tone: "ok" }}
        chips={[
          { label: "3 placements", tone: "plain" },
          { label: "panorama", tone: "ok" },
        ]}
        trailing={{ label: "Open →", tone: "accent" }}
      />,
    );
    expect(screen.getByRole("article", { name: "North Ridge Pad" })).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("3 placements")).toBeInTheDocument();
    expect(screen.getByText("north-ridge-pad")).toBeInTheDocument();
    expect(screen.getByText("Open →")).toBeInTheDocument();
  });

  it("shows the progress bar and stage only while converting", () => {
    const { rerender } = render(
      <CatalogCard
        title="Terminal Yard 4"
        slug="terminal-yard-4"
        trailing={{ label: "converting", tone: "warn" }}
        progress={{ value: 62, stage: "Compressing textures… ~4 min" }}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "62");
    expect(screen.getByText("Compressing textures… ~4 min")).toBeInTheDocument();

    rerender(
      <CatalogCard
        title="Terminal Yard 4"
        slug="terminal-yard-4"
        trailing={{ label: "Open →", tone: "accent" }}
      />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders the thumbnail when given and the no-image label otherwise", () => {
    const { container, rerender } = render(
      <CatalogCard
        title="Pump Jack Unit"
        slug="pump-jack-unit"
        thumbnailUrl="/api/assets/abc"
        trailing={{ label: "in 6 territories", tone: "accent" }}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/assets/abc");

    rerender(
      <CatalogCard
        title="Flare Stack"
        slug="flare-stack"
        noImageLabel="no image"
        trailing={{ label: "unavailable", tone: "muted" }}
      />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("no image")).toBeInTheDocument();
  });

  it("opens on click only when onOpen is given, and never from the overlay actions", async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <CatalogCard
        title="Refinery Block C"
        slug="refinery-block-c"
        trailing={{ label: "Open →", tone: "accent" }}
        onOpen={onOpen}
        actions={
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("article", { name: "Refinery Block C" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders no click affordance without onOpen", () => {
    render(<CatalogCard title="T" slug="t" trailing={{ label: "unavailable", tone: "muted" }} />);
    expect(screen.getByRole("article").className).not.toContain("cursor-pointer");
  });

  it("fits the small size", () => {
    render(
      <CatalogCard
        title="Pump Jack Unit"
        slug="pump-jack-unit"
        size="sm"
        trailing={{ label: "in 6 territories", tone: "accent" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pump Jack Unit" }).className).toContain("text-[14px]");
  });

  it("omits the description paragraph when there is none", () => {
    const { container } = render(
      <CatalogCard title="T" slug="t" trailing={{ label: "Open →", tone: "accent" }} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
