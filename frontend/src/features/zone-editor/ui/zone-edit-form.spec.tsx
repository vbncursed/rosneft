import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import { HttpError } from "@/shared/api";
import { ZoneEditForm } from "./zone-edit-form";

const ZONE = { id: 3, title: "Tank row", tags: [{ slug: "tanks", title: "Tanks" }] } as Zone;
const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
  { slug: "cranes", title: "Cranes" },
  { slug: "pipes", title: "Pipes" },
  { slug: "tents", title: "Tents" },
  { slug: "cabins", title: "Cabins" },
  { slug: "ungrouped", title: "Ungrouped" },
];

const view = (over: { onSave?: () => Promise<void>; onDone?: () => void; seed?: boolean } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (over.seed !== false) client.setQueryData(["model-tags"], TAGS);
  const onDone = over.onDone ?? vi.fn();
  const onSave = over.onSave ?? vi.fn(async () => {});
  const parentKey = vi.fn();
  render(
    <div onKeyDown={parentKey}>
      <QueryClientProvider client={client}>
        <ZoneEditForm zone={ZONE} onSave={onSave} onDone={onDone} />
      </QueryClientProvider>
    </div>,
  );
  return { onSave, onDone, parentKey };
};

const save = () => screen.getByRole("button", { name: "Save" });

describe("ZoneEditForm", () => {
  it("is prefilled with the title and the zone's tags, and never offers ungrouped", () => {
    view();
    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveValue("Tank row");
    expect(screen.getByRole("checkbox", { name: "Tanks" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pumps" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Ungrouped" })).toBeNull();
  });

  it("keeps Save off until something changed, and sends only that", async () => {
    const { onSave, onDone } = view();
    expect(save()).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Pumps" }));
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({ tagSlugs: ["tanks", "pumps"] });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("keeps Save off with a blank title or no tag", async () => {
    view();
    await userEvent.clear(screen.getByRole("textbox", { name: /Title/ }));
    expect(save()).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "Pump row");
    expect(save()).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Tanks" }));
    expect(save()).toBeDisabled();
  });

  it("allows five tags and disables the rest", async () => {
    view();
    for (const name of ["Pumps", "Cranes", "Pipes", "Tents"])
      await userEvent.click(screen.getByRole("checkbox", { name }));
    expect(screen.getByRole("checkbox", { name: "Cabins" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Tanks" })).toBeEnabled();
  });

  it("shows a refused title under the field", async () => {
    view({ onSave: () => Promise.reject(new HttpError(400, null, "a zone with this title already exists")) });
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "2");
    await userEvent.click(save());
    expect(await screen.findByText("a zone with this title already exists")).toBeInTheDocument();
  });

  it("cancels from its button without saving", async () => {
    const { onSave, onDone } = view();
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "2");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("cancels on Escape and keeps the key from the viewer", async () => {
    const { onDone, parentKey } = view();
    screen.getByRole("textbox", { name: /Title/ }).focus();
    await userEvent.keyboard("{Escape}");
    expect(onDone).toHaveBeenCalledOnce();
    expect(parentKey).not.toHaveBeenCalled();
  });

  it("offers Reload tags and no Save when the tag list failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
    );
    view({ seed: false });
    expect(await screen.findByRole("button", { name: "Reload tags" })).toBeInTheDocument();
    expect(save()).toBeDisabled();
    vi.unstubAllGlobals();
  });
});
