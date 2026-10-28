import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useZoneEdit } from "./use-zone-edit";

const ZONE = {
  id: 3,
  title: "Tank row",
  tags: [{ slug: "tanks", title: "Tanks" }],
} as Zone;
const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
];

const edit = (onSave = vi.fn(async () => {}), seed = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) client.setQueryData(["model-tags"], TAGS);
  const onDone = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => ({ f: useZoneEdit({ zone: ZONE, onSave, onDone }), notices: useNotices() }), {
    wrapper,
  });
  return { ...hook, onSave, onDone };
};

afterEach(clearNotices);

describe("useZoneEdit", () => {
  it("is prefilled and cannot save until something changed", () => {
    const { result } = edit();
    expect(result.current.f.title).toBe("Tank row");
    expect(result.current.f.selected).toEqual(["tanks"]);
    expect(result.current.f.canSave).toBe(false);
    act(() => result.current.f.setTitle("  Tank row  "));
    expect(result.current.f.canSave).toBe(false);
  });

  it("cannot save a blank title or an empty tag set", () => {
    const { result } = edit();
    act(() => result.current.f.setTitle("   "));
    expect(result.current.f.canSave).toBe(false);
    act(() => result.current.f.setTitle("New"));
    expect(result.current.f.canSave).toBe(true);
    act(() => result.current.f.toggleTag("tanks"));
    expect(result.current.f.canSave).toBe(false);
  });

  it("sends only the fields that changed and then finishes", async () => {
    const { result, onSave, onDone } = edit();
    act(() => result.current.f.toggleTag("pumps"));
    await act(() => result.current.f.submit());
    expect(onSave).toHaveBeenCalledWith({ tagSlugs: ["tanks", "pumps"] });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("sends a trimmed title alone", async () => {
    const { result, onSave } = edit();
    act(() => result.current.f.setTitle(" Pump row "));
    await act(() => result.current.f.submit());
    expect(onSave).toHaveBeenCalledWith({ title: "Pump row" });
  });

  it("puts a 400 on the title and stays open", async () => {
    const onSave = vi.fn().mockRejectedValue(new HttpError(400, null, "a zone with this title already exists"));
    const { result, onDone } = edit(onSave);
    act(() => result.current.f.setTitle("Other"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBe("a zone with this title already exists");
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.f.busy).toBe(false);
  });

  it("reports a 403 as a notice with the server's words, not under the field", async () => {
    const onSave = vi.fn().mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
    const { result } = edit(onSave);
    act(() => result.current.f.setTitle("Other"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBeNull();
    expect(result.current.notices[0]).toMatchObject({ tone: "error", message: "You don't have permission to do this" });
  });

  it("reports a 400 that is not about the title as a notice", async () => {
    const onSave = vi.fn().mockRejectedValue(new HttpError(400, null, "unknown model tag"));
    const { result } = edit(onSave);
    act(() => result.current.f.setTitle("Other"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBeNull();
    expect(result.current.notices[0]).toMatchObject({ tone: "error", message: "unknown model tag" });
  });

  it("reports a 5xx as a notice, not under the field", async () => {
    const onSave = vi.fn().mockRejectedValue(new HttpError(503, null, "internal"));
    const { result } = edit(onSave);
    act(() => result.current.f.setTitle("Other"));
    await act(() => result.current.f.submit());
    expect(result.current.f.error).toBeNull();
    expect(result.current.notices[0]).toMatchObject({
      tone: "error",
      message: "Could not update the zone. Try again.",
    });
  });

  it("sends once however often it is submitted while the save runs", async () => {
    let release = () => {};
    const onSave = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { result } = edit(onSave);
    act(() => result.current.f.setTitle("Other"));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.f.submit();
      void result.current.f.submit();
    });
    expect(onSave).toHaveBeenCalledOnce();
    expect(result.current.f.busy).toBe(true);
    expect(result.current.f.canSave).toBe(false);
    release();
    await act(() => first);
  });

  it("will not save while the tag list is missing", () => {
    const { result } = edit(undefined, false);
    act(() => result.current.f.setTitle("Other"));
    expect(result.current.f.tags).toBeUndefined();
    expect(result.current.f.canSave).toBe(false);
  });
});
