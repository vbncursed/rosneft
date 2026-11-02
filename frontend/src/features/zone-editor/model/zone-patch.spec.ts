import { describe, expect, it } from "vitest";
import { zonePatch } from "./zone-patch";

const zone = {
  title: "Tank row",
  tags: [
    { slug: "tanks", title: "Tanks" },
    { slug: "pumps", title: "Pumps" },
  ],
};

describe("zonePatch", () => {
  it("is null when nothing differs, whatever the whitespace or the order of the tags", () => {
    expect(zonePatch(zone, "  Tank row ", ["pumps", "tanks"])).toBeNull();
  });

  it("sends only the title when only the title changed, trimmed", () => {
    expect(zonePatch(zone, " Pump row ", ["tanks", "pumps"])).toEqual({ title: "Pump row" });
  });

  it("sends only the tags when only they changed, as the whole new set", () => {
    expect(zonePatch(zone, "Tank row", ["tanks"])).toEqual({ tagSlugs: ["tanks"] });
    expect(zonePatch(zone, "Tank row", ["tanks", "pumps", "cranes"])).toEqual({
      tagSlugs: ["tanks", "pumps", "cranes"],
    });
  });

  it("sends both when both changed", () => {
    expect(zonePatch(zone, "Cranes", ["cranes"])).toEqual({ title: "Cranes", tagSlugs: ["cranes"] });
  });
});
