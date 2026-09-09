import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccessGroups, type AccessGroup } from "./access-groups";
import type { TerritoryAccess } from "@/entities/territory";

const territory = (slug: string, title: string, over: Partial<TerritoryAccess> = {}): TerritoryAccess => ({
  slug,
  title,
  visibility: "assigned",
  meta: `${slug} · 14 placements`,
  faces: ["a.ivanova"],
  peopleLabel: "4 people",
  ...over,
});

const GROUPS: AccessGroup[] = [
  {
    key: "assigned",
    label: "Assigned",
    note: "6 territories",
    territories: [territory("refinery-block-c", "Refinery Block C")],
  },
  {
    key: "company",
    label: "Whole company",
    note: "4 territories",
    territories: [
      territory("north-ridge-pad", "North Ridge Pad", { visibility: "company", peopleLabel: "26 accounts" }),
    ],
  },
];

describe("AccessGroups", () => {
  it("renders a labelled section per group with its note", () => {
    render(<AccessGroups groups={GROUPS} onManage={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Assigned" })).toBeInTheDocument();
    expect(screen.getByText("4 territories")).toBeInTheDocument();
  });

  it("renders one row per territory", () => {
    render(<AccessGroups groups={GROUPS} onManage={vi.fn()} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("marks the selected row", () => {
    render(<AccessGroups groups={GROUPS} selectedSlug="north-ridge-pad" onManage={vi.fn()} />);
    expect(screen.getByRole("article", { name: "North Ridge Pad" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("opens the manager with the whole territory", async () => {
    const onManage = vi.fn();
    render(<AccessGroups groups={GROUPS} onManage={onManage} />);
    await userEvent.click(screen.getByRole("button", { name: "Manage access to Refinery Block C" }));
    expect(onManage).toHaveBeenCalledWith(expect.objectContaining({ slug: "refinery-block-c" }));
  });

  it("hides a group the filter emptied", () => {
    render(
      <AccessGroups
        groups={[...GROUPS, { key: "private", label: "Owner-only", territories: [] }]}
        onManage={vi.fn()}
      />,
    );
    expect(screen.queryByRole("region", { name: "Owner-only" })).not.toBeInTheDocument();
  });

  it("says the filter matched nothing rather than showing empty headings", () => {
    render(<AccessGroups groups={[{ key: "x", label: "Assigned", territories: [] }]} onManage={vi.fn()} />);
    expect(screen.getByText("No territories match this filter.")).toBeInTheDocument();
    expect(screen.getByText("Loosen the filter to see more territories.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("drops the loosen-the-filter line when the caller worded the empty list itself", () => {
    render(
      <AccessGroups groups={[]} onManage={vi.fn()} emptyHint="No territories yet — upload one to start." />,
    );
    expect(screen.getByText("No territories yet — upload one to start.")).toBeInTheDocument();
    expect(screen.queryByText(/Loosen the filter/)).not.toBeInTheDocument();
  });
});
