import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";

const ZONE = { id: 3, title: "Tank row", tags: [{ slug: "tanks", title: "Tanks" }] } as Zone;

// Each test gets a fresh module graph, so the lazy chunk has not been loaded yet.
async function slot(chunk: () => Promise<object>) {
  vi.resetModules();
  vi.doMock("@/features/zone-editor", chunk);
  return import("./zone-edit-slot");
}

type Slot = typeof import("./zone-edit-slot").ZoneEditSlot;

// The slot and its notices come from the same reset graph, so both are read after `slot()`.
const mount = async (ZoneEditSlot: Slot, onDone = vi.fn()) => {
  const { useNotices } = await import("@/shared/lib/notify");
  const Toasts = () => useNotices().map((n) => <p key={n.id}>{n.message}</p>);
  const client = new QueryClient();
  client.setQueryData(["model-tags"], []);
  render(
    <QueryClientProvider client={client}>
      <Toasts />
      <ZoneEditSlot zone={ZONE} onSave={async () => {}} onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
};

afterEach(() => vi.doUnmock("@/features/zone-editor"));

describe("ZoneEditSlot", () => {
  it("shows a placeholder in the form's shape while the chunk loads, then the form", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const real = await vi.importActual<object>("@/features/zone-editor");
    const { ZoneEditSlot } = await slot(async () => {
      await gate;
      return real;
    });
    await mount(ZoneEditSlot);
    expect(screen.getByRole("status", { name: "Opening the editor" })).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
    release();
    expect(await screen.findByRole("form", { name: "Edit details of Tank row" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Opening the editor" })).toBeNull();
  });

  it("gives the card back and says so when the editor cannot open", async () => {
    // The lazy rethrows a failed import at render, the same way a form that throws does.
    const { ZoneEditSlot } = await slot(async () => ({
      ZoneEditForm: () => {
        throw new Error("Failed to fetch dynamically imported module");
      },
    }));
    const onDone = await mount(ZoneEditSlot);
    expect(await screen.findByText("Could not open the editor. Try again.")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status", { name: "Opening the editor" })).toBeNull();
  });
});
