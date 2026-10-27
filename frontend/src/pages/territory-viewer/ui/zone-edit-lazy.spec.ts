import { describe, expect, it } from "vitest";
import { ZoneEditForm } from "@/features/zone-editor";
import { preloadZoneEdit, ZoneEditFormLazy } from "./zone-edit-lazy";

describe("ZoneEditFormLazy", () => {
  it("loads the edit form on demand", async () => {
    expect((await preloadZoneEdit()).default).toBe(ZoneEditForm);
  });

  it("is a lazy component the card can suspend on", () => {
    expect(ZoneEditFormLazy.$$typeof).toBe(Symbol.for("react.lazy"));
  });
});
