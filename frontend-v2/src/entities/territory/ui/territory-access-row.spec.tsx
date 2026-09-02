import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerritoryAccessRow } from "./territory-access-row";
import type { TerritoryAccess } from "../model/access";

const territory = (over: Partial<TerritoryAccess> = {}): TerritoryAccess => ({
  slug: "refinery-block-c",
  title: "Refinery Block C",
  visibility: "assigned",
  meta: "refinery-block-c · 14 placements · upd. 29.08",
  faces: ["a.ivanova", "m.orlova", "k.petrov"],
  peopleLabel: "4 people",
  ...over,
});

describe("TerritoryAccessRow", () => {
  it("names the territory and how far it reaches", () => {
    render(<TerritoryAccessRow territory={territory()} onManage={() => {}} />);
    expect(screen.getByText("Refinery Block C")).toBeInTheDocument();
    expect(screen.getByText("assigned")).toBeInTheDocument();
    expect(screen.getByText("4 people")).toBeInTheDocument();
    expect(screen.getByText(/14 placements/)).toBeInTheDocument();
  });

  it("colours the rail by visibility", () => {
    const { container, rerender } = render(
      <TerritoryAccessRow territory={territory()} onManage={() => {}} />,
    );
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-accent");

    rerender(<TerritoryAccessRow territory={territory({ visibility: "company" })} onManage={() => {}} />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-ok");

    rerender(<TerritoryAccessRow territory={territory({ visibility: "private" })} onManage={() => {}} />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-line-2");
  });

  it("writes the visibility out, so colour is not the only cue", () => {
    render(<TerritoryAccessRow territory={territory({ visibility: "private" })} onManage={() => {}} />);
    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it("stacks the faces of who can open it", () => {
    render(<TerritoryAccessRow territory={territory()} onManage={() => {}} />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "k.petrov" })).toBeInTheDocument();
  });

  it("marks the selected row as current and brightens its rail", () => {
    const { container, rerender } = render(
      <TerritoryAccessRow territory={territory()} onManage={() => {}} />,
    );
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("opacity-50");

    rerender(<TerritoryAccessRow territory={territory()} selected onManage={() => {}} />);
    expect(screen.getByRole("article")).toHaveAttribute("aria-current", "true");
    expect(container.querySelector("span[aria-hidden]")!.className).not.toContain("opacity-50");
  });

  it("opens the manager from the row or its button", async () => {
    const onManage = vi.fn();
    render(<TerritoryAccessRow territory={territory()} onManage={onManage} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Manage access to Refinery Block C" }),
    );
    await userEvent.click(screen.getByRole("article", { name: "Refinery Block C" }));
    expect(onManage).toHaveBeenCalledTimes(2);
  });

  it("names the manage button after its territory — several are on screen", () => {
    render(<TerritoryAccessRow territory={territory()} onManage={() => {}} />);
    const button = screen.getByRole("button", { name: "Manage access to Refinery Block C" });
    expect(button).toHaveTextContent("Manage");
  });
});
