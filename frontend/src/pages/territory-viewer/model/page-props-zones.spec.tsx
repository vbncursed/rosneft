import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import { basePageParts, IDLE_ZONES } from "../territory-viewer-page.fixture";
import { preloadZoneEdit } from "../ui/zone-edit-chunk";
import { planLayer, zoneCard } from "./page-props-zones";
import type { PageParts } from "./viewer-props";

vi.mock("../ui/zone-edit-chunk", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  preloadZoneEdit: vi.fn(() => Promise.resolve()),
}));

const ZONE: Zone = {
  id: 5,
  title: "Tank row",
  corners: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ],
  tags: [{ slug: "tanks", title: "Tanks" }],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
};

const parts = (zones: Partial<PageParts["zones"]> = {}, grants: Partial<PageParts["grants"]> = {}): PageParts => {
  const p = basePageParts();
  return { ...p, grants: { ...p.grants, ...grants }, zones: { ...IDLE_ZONES, ...zones } };
};

describe("planLayer", () => {
  it("mounts nothing without a layer", () => {
    expect(planLayer(parts())).toBeNull();
  });

  it("mounts the lazy layer when there is one", () => {
    expect(planLayer(parts({ layer: { slug: "t" } as never }))).not.toBeNull();
  });
});

describe("zoneCard", () => {
  it("is nothing while no zone is selected and no editor is open", () => {
    expect(zoneCard(parts())).toBeNull();
  });

  it("gives the editor a slot for its card", () => {
    render(<>{zoneCard(parts({ editing: { id: 1 } as never }))}</>);
    expect(screen.getByTestId("plan-editor-slot")).toBeInTheDocument();
  });

  it("draws the selected zone, and closes it from its button", async () => {
    const onSelect = vi.fn();
    render(<>{zoneCard(parts({ selected: ZONE, onSelect }))}</>);
    expect(screen.getByRole("heading", { name: "Tank row" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close Tank row" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("offers Edit only to zone:write, and its form saves through the viewer's update", async () => {
    const { unmount } = render(<>{zoneCard(parts({ selected: ZONE }, { zoneWrite: false }))}</>);
    expect(screen.queryByRole("button", { name: "Edit details of Tank row" })).toBeNull();
    unmount();
    const onUpdate = vi.fn(async () => {});
    const client = new QueryClient();
    client.setQueryData(["model-tags"], [{ slug: "pumps", title: "Pumps" }]);
    render(
      <QueryClientProvider client={client}>
        {zoneCard(parts({ selected: ZONE, onUpdate }, { zoneWrite: true }))}
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit details of Tank row" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Pumps" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdate).toHaveBeenCalledWith(5, { tagSlugs: ["tanks", "pumps"] });
  });

  it("warms the form's chunk when the pointer reaches Edit details", async () => {
    render(<>{zoneCard(parts({ selected: ZONE }, { zoneWrite: true }))}</>);
    await userEvent.hover(screen.getByRole("button", { name: "Edit details of Tank row" }));
    expect(preloadZoneEdit).toHaveBeenCalled();
  });

  it("moves focus into Title on Edit details, and back to the button after Cancel and after a save", async () => {
    const client = new QueryClient();
    client.setQueryData(["model-tags"], [{ slug: "pumps", title: "Pumps" }]);
    render(
      <QueryClientProvider client={client}>
        {zoneCard(parts({ selected: ZONE, onUpdate: async () => {} }, { zoneWrite: true }))}
      </QueryClientProvider>,
    );
    const edit = () => screen.getByRole("button", { name: "Edit details of Tank row" });
    await userEvent.click(edit());
    expect(await screen.findByRole("textbox", { name: /Title/ })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(edit()).toHaveFocus();

    await userEvent.click(edit());
    await userEvent.click(await screen.findByRole("checkbox", { name: "Pumps" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Edit details of Tank row" })).toHaveFocus();
  });

  it("offers Delete only to zone:write", () => {
    const { unmount } = render(<>{zoneCard(parts({ selected: ZONE }, { zoneWrite: false }))}</>);
    expect(screen.queryByRole("button", { name: "Delete Tank row" })).toBeNull();
    unmount();
    render(<>{zoneCard(parts({ selected: ZONE }, { zoneWrite: true }))}</>);
    expect(screen.getByRole("button", { name: "Delete Tank row" })).toBeInTheDocument();
  });
});
