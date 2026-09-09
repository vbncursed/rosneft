import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessGrant, TerritoryAccess } from "@/entities/territory";
import type { AccessState } from "../model/use-territory-access";
import { TerritoryAccessScreen } from "./territory-access-screen";

const { useTerritoryAccess } = vi.hoisted(() => ({ useTerritoryAccess: vi.fn() }));
vi.mock("../model/use-territory-access", () => ({ useTerritoryAccess }));

const SHARED: TerritoryAccess = {
  slug: "t-1",
  title: "T 1",
  visibility: "assigned",
  meta: "t-1",
  faces: ["a.ivanova"],
  peopleLabel: "1 person",
};
const ALONE: TerritoryAccess = {
  slug: "t-2",
  title: "T 2",
  visibility: "private",
  meta: "t-2",
  faces: [],
  peopleLabel: "owner only",
};
const GRANT: AccessGrant = { userId: "u-1", username: "a.ivanova", roleTitle: "Editor", via: "direct" };

const state = (over: Partial<AccessState> = {}): AccessState => ({
  status: "ready",
  error: null,
  territories: [SHARED, ALONE],
  adminsBySlug: { "t-1": ["u-1"], "t-2": [] },
  grantsOf: (slug) => (slug === "t-1" ? [GRANT] : []),
  canManage: true,
  query: "",
  setQuery: vi.fn(),
  selected: null,
  select: vi.fn(),
  draft: [],
  dirty: false,
  add: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
  save: vi.fn(),
  saving: false,
  candidates: [{ id: "u-2", username: "k.petrov" }],
  adding: false,
  setAdding: vi.fn(),
  ...over,
});

beforeEach(() => useTerritoryAccess.mockReset());

describe("TerritoryAccessScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useTerritoryAccess.mockReturnValue(state({ status: "loading", territories: null }));
    const { unmount } = render(<TerritoryAccessScreen />);
    expect(screen.getByRole("status", { name: "Loading territories" })).toBeInTheDocument();
    unmount();
    useTerritoryAccess.mockReturnValue(state({ status: "unavailable", territories: null, error: "boom" }));
    render(<TerritoryAccessScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("groups shared from not shared and filters by person", () => {
    useTerritoryAccess.mockReturnValue(state({ query: "person:ivanova" }));
    render(<TerritoryAccessScreen />);
    expect(screen.getByRole("article", { name: "T 1" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "T 2" })).not.toBeInTheDocument();
  });

  it("draws no Bulk assign and no visibility switch", () => {
    useTerritoryAccess.mockReturnValue(state({ selected: SHARED, draft: [GRANT] }));
    render(<TerritoryAccessScreen />);
    expect(screen.queryByRole("button", { name: "Bulk assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Assigned people")).toBeInTheDocument();
  });

  it("removes, adds through the dialog, and saves through the container", async () => {
    const s = state({ selected: SHARED, draft: [GRANT], dirty: true, adding: true });
    useTerritoryAccess.mockReturnValue(s);
    render(<TerritoryAccessScreen />);
    const aside = screen.getByRole("complementary", { name: "Access: T 1" });
    await userEvent.click(within(aside).getByRole("button", { name: "Remove a.ivanova's access" }));
    expect(s.remove).toHaveBeenCalledWith("u-1");
    const dialog = screen.getByRole("dialog", { name: "Add person" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add person" }));
    expect(s.add).toHaveBeenCalledWith("u-2");
    await userEvent.click(within(aside).getByRole("button", { name: "Save access" }));
    expect(s.save).toHaveBeenCalled();
  });

  it("wires a row's Manage, the panel's close and its add-person to the container", async () => {
    const s = state({ selected: SHARED, draft: [GRANT] });
    useTerritoryAccess.mockReturnValue(s);
    render(<TerritoryAccessScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Manage access to T 2" }));
    expect(s.select).toHaveBeenCalledWith("t-2");
    const aside = screen.getByRole("complementary", { name: "Access: T 1" });
    await userEvent.click(within(aside).getByRole("button", { name: "+ add person" }));
    expect(s.setAdding).toHaveBeenCalledWith(true);
    await userEvent.click(within(aside).getByRole("button", { name: "Close" }));
    expect(s.select).toHaveBeenCalledWith(null);
  });

  it("says the catalog is empty rather than blaming the filter", () => {
    useTerritoryAccess.mockReturnValue(state({ territories: [], adminsBySlug: {} }));
    render(<TerritoryAccessScreen />);
    expect(screen.getByText("No territories yet — upload one to start.")).toBeInTheDocument();
  });
});
