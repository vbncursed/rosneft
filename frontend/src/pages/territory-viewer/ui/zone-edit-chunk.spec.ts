import { describe, expect, it } from "vitest";
import { ZoneEditForm } from "@/features/zone-editor";
import { preloadZoneEdit, resetZoneEdit, zoneEditForm } from "./zone-edit-chunk";

describe("zone edit chunk", () => {
  it("preloads the form's module", async () => {
    expect((await preloadZoneEdit()).default).toBe(ZoneEditForm);
  });

  it("hands out one lazy form until it is reset, then a fresh one", () => {
    const first = zoneEditForm();
    expect(zoneEditForm()).toBe(first);
    resetZoneEdit();
    expect(zoneEditForm()).not.toBe(first);
  });
});
