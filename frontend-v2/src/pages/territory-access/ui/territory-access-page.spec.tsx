import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerritoryAccessPage, type TerritoryAccessPageProps } from "./territory-access-page";
import type { AccessGrant, TerritoryAccess } from "@/entities/territory";

const territory = (slug: string, title: string, over: Partial<TerritoryAccess> = {}): TerritoryAccess => ({
  slug,
  title,
  visibility: "assigned",
  meta: `${slug} · 14 placements`,
  faces: ["a.ivanova"],
  peopleLabel: "4 people",
  ...over,
});

const grant = (over: Partial<AccessGrant> = {}): AccessGrant => ({
  userId: "u-3",
  username: "k.petrov",
  roleTitle: "Field Operator",
  via: "direct",
  ...over,
});

const props = (over: Partial<TerritoryAccessPageProps> = {}): TerritoryAccessPageProps => ({
  groups: [
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
      territories: [territory("north-ridge-pad", "North Ridge Pad", { visibility: "company" })],
    },
  ],
  mix: {
    label: "Visibility mix",
    detail: "12 territories",
    segments: [
      { tone: "accent", value: 6, label: "assigned" },
      { tone: "ok", value: 4, label: "whole company" },
      { tone: "neutral", value: 2, label: "private" },
    ],
  },
  stats: [
    { label: "Guests with access", value: "9", hint: "assigned individually" },
    { label: "Owner-only", value: "2", hint: "not shared yet", tone: "bad" },
    { label: "Grants", value: "38", hint: "24 direct · 14 via role", tone: "accent" },
  ],
  query: "",
  onQueryChange: vi.fn(),
  selectedSlug: null,
  onManage: vi.fn(),
  onCloseInspector: vi.fn(),
  onVisibilityChange: vi.fn(),
  onAddPerson: vi.fn(),
  onRemoveGrant: vi.fn(),
  onCancel: vi.fn(),
  onSave: vi.fn(),
  onBulkAssign: vi.fn(),
  ...over,
});

const managed = (over = {}) => ({
  territory: territory("refinery-block-c", "Refinery Block C"),
  visibility: "assigned" as const,
  grants: [grant()],
  ...over,
});

describe("TerritoryAccessPage", () => {
  it("names the page with one h1", () => {
    render(<TerritoryAccessPage {...props()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Territory access" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Owner only · who can open what")).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<TerritoryAccessPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("summarises how far the catalog reaches", () => {
    render(<TerritoryAccessPage {...props()} />);
    expect(screen.getByRole("img", { name: /Visibility mix/ })).toBeInTheDocument();
    expect(screen.getByText("12 territories")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner-only: 2").className).toContain("text-bad");
  });

  it("groups territories by how far they reach", () => {
    render(<TerritoryAccessPage {...props()} />);
    expect(screen.getByRole("region", { name: "Assigned" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Whole company" })).toBeInTheDocument();
  });

  it("opens the manager with the whole territory", async () => {
    const onManage = vi.fn();
    render(<TerritoryAccessPage {...props({ onManage })} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Manage access to Refinery Block C" }),
    );
    expect(onManage).toHaveBeenCalledWith(expect.objectContaining({ slug: "refinery-block-c" }));
  });

  it("keeps the manager out of the tree until a territory is open", () => {
    render(<TerritoryAccessPage {...props({ selectedSlug: "refinery-block-c", managed: null })} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the manager on the selected territory", () => {
    render(
      <TerritoryAccessPage {...props({ selectedSlug: "refinery-block-c", managed: managed() })} />,
    );
    expect(
      screen.getByRole("complementary", { name: "Access: Refinery Block C" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Assigned people/ })).toBeChecked();
  });

  it("changes visibility through the manager", async () => {
    const onVisibilityChange = vi.fn();
    render(
      <TerritoryAccessPage
        {...props({ selectedSlug: "refinery-block-c", managed: managed(), onVisibilityChange })}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Whole company/ }));
    expect(onVisibilityChange).toHaveBeenCalledWith("company");
  });

  it("revokes a direct grant", async () => {
    const onRemoveGrant = vi.fn();
    render(
      <TerritoryAccessPage
        {...props({ selectedSlug: "refinery-block-c", managed: managed(), onRemoveGrant })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove k.petrov's access" }));
    expect(onRemoveGrant).toHaveBeenCalledWith("u-3");
  });

  it("saves only once something changed", async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <TerritoryAccessPage {...props({ selectedSlug: "refinery-block-c", managed: managed(), onSave })} />,
    );
    expect(screen.getByRole("button", { name: "Save access" })).toBeDisabled();

    rerender(
      <TerritoryAccessPage
        {...props({ selectedSlug: "refinery-block-c", managed: managed({ dirty: true }), onSave })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save access" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("bulk assigns", async () => {
    const onBulkAssign = vi.fn();
    render(<TerritoryAccessPage {...props({ onBulkAssign })} />);
    await userEvent.click(screen.getByRole("button", { name: "Bulk assign" }));
    expect(onBulkAssign).toHaveBeenCalledOnce();
  });

  it("hides bulk assign from a reader who may not manage access", () => {
    render(<TerritoryAccessPage {...props({ canManage: false })} />);
    expect(screen.queryByRole("button", { name: "Bulk assign" })).not.toBeInTheDocument();
  });

  it("hides bulk assign and the visibility switch when the gateway offers neither", () => {
    render(
      <TerritoryAccessPage
        {...props({
          onBulkAssign: undefined,
          onVisibilityChange: undefined,
          selectedSlug: "refinery-block-c",
          managed: managed(),
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Bulk assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("shows a chip for a key:value query", () => {
    render(<TerritoryAccessPage {...props({ query: "visibility:assigned" })} />);
    expect(
      screen.getByRole("button", { name: "Remove filter visibility:assigned" }),
    ).toBeInTheDocument();
  });
});
