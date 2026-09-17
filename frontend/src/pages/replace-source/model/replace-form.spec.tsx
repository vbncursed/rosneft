import { describe, expect, it } from "vitest";
import { currentRows, isBusy, newRows, PRESERVED, stagesFor, type ReplacePhase } from "./replace-form";

const territory = { slug: "t", title: "T", sourceBlobHash: "5b81" + "0".repeat(56) + "c40e", placementCount: 0, createdAt: "2026-09-02T00:00:00Z" };
const file = (bytes: number) => new File([new Uint8Array(bytes)], "rev4.zip");

describe("replace form", () => {
  it("is busy from the first byte to the gateway's answer", () => {
    const idle: ReplacePhase[] = ["idle", "picked"];
    const busy: ReplacePhase[] = ["uploading", "finalizing", "replacing"];
    expect(idle.map(isBusy)).toEqual([false, false]);
    expect(busy.map(isBusy)).toEqual([true, true, true]);
  });

  it("describes the current source, with a dash where the size is unknown", () => {
    expect(currentRows(territory, 1024).map((r) => [r.label, r.value])).toEqual([["size", "1 KB"], ["uploaded", "02.09"]]);
    expect(currentRows(territory, null)[0].value).toBe("—");
  });

  it("also dashes the upload date when the territory carries none", () => {
    expect(currentRows({ ...territory, createdAt: undefined }, 1024)[1].value).toBe("—");
  });

  it("describes the new file and its delta against the current size", () => {
    expect(newRows(file(2048), 1024).map((r) => [r.label, r.value])).toEqual([["size", "2 KB"], ["selected", "just now"], ["delta", "+1 KB"]]);
    expect(newRows(file(512), 1024).at(-1)?.value).toBe("−512 B");
    expect(newRows(file(512), null).map((r) => r.label)).toEqual(["size", "selected"]);
  });

  it("reads an unchanged size as a neutral delta", () => {
    expect(newRows(file(1024), 1024).at(-1)?.value).toBe("±0 B");
  });

  it("moves the first two stages with the phase and leaves the rest queued", () => {
    expect(stagesFor("idle", null).map((s) => s.state)).toEqual(["pending", "pending", "pending", "pending", "pending"]);
    expect(stagesFor("uploading", 41)[0]).toMatchObject({ state: "active", time: "41%" });
    expect(stagesFor("finalizing", null).slice(0, 2).map((s) => s.state)).toEqual(["done", "active"]);
    expect(stagesFor("replacing", null).slice(0, 2).map((s) => s.state)).toEqual(["done", "done"]);
    expect(stagesFor("idle", null).map((s) => s.time)).toEqual(["queued", "queued", "~1 min", "~3 min", "~10 s"]);
  });

  it("keeps four things and drops one", () => {
    expect(PRESERVED.map((i) => i.ok)).toEqual([true, true, true, true, false]);
  });
});
