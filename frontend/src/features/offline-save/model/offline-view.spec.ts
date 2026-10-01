import { describe, expect, it } from "vitest";
import { offlineView } from "./offline-view";

const saved = { slug: "a", title: "A", bytes: 1288490189, savedAt: "t", syncedAt: "t" };

describe("offlineView", () => {
  it("offers to save what is not saved", () => expect(offlineView()).toEqual({ kind: "idle", label: "Save offline" }));
  it("says it is waiting while queued", () =>
    expect(offlineView(undefined, { slug: "a", state: "queued", done: 0, total: 0 })).toEqual({ kind: "saving", label: "Waiting to save…", percent: null }));
  it("counts files while saving", () =>
    expect(offlineView(undefined, { slug: "a", state: "saving", done: 2, total: 5 })).toEqual({ kind: "saving", label: "Saving… 40%", percent: 40 }));
  it("names the size once saved", () => expect(offlineView(saved)).toEqual({ kind: "saved", label: "Available offline · 1.2 GB" }));
  it("says why a save failed, in words", () => {
    expect(offlineView(undefined, { slug: "a", state: "failed", done: 0, total: 0, error: "no-space" })).toEqual({
      kind: "failed",
      label: "Couldn't save — not enough disk space",
    });
  });
  it("says to reconnect instead of offering a save that would fail", () => {
    expect(offlineView(undefined, undefined, false)).toEqual({ kind: "offline", label: "Reconnect to save" });
    const failed = { slug: "a", state: "failed" as const, done: 0, total: 0, error: "network" as const };
    expect(offlineView(undefined, failed, false).kind).toBe("offline");
  });
  it("leaves a saved territory and a running save alone while offline", () => {
    expect(offlineView(saved, undefined, false).kind).toBe("saved");
    expect(offlineView(undefined, { slug: "a", state: "saving", done: 1, total: 4 }, false).kind).toBe("saving");
  });
  it("shows a resync of a saved territory as saving", () =>
    expect(offlineView(saved, { slug: "a", state: "saving", done: 1, total: 4 }).kind).toBe("saving"));
  it("a failed resync of a saved territory still reads saved: the copy is intact", () => {
    const failed = { slug: "a", state: "failed" as const, done: 0, total: 0, error: "network" as const };
    expect(offlineView(saved, failed)).toEqual({ kind: "saved", label: "Available offline · 1.2 GB" });
  });
});
