import { describe, expect, it } from "vitest";
import { modelsForZone } from "./models-for-zone";
import type { Zone } from "./zone";

const tag = (slug: string) => ({ slug, title: slug });
const option = (slug: string, tagSlug: string) => ({ slug, tag: tag(tagSlug) });
const zoneWith = (...tags: string[]) => ({ tags: tags.map(tag) }) as Zone;

const LIBRARY = [option("a", "tanks"), option("b", "cranes"), option("c", "ungrouped")];

describe("modelsForZone", () => {
  it("returns only options carrying a zone tag", () => {
    expect(modelsForZone(LIBRARY, zoneWith("tanks")).map((o) => o.slug)).toEqual(["a"]);
  });
  it("never returns ungrouped", () => {
    expect(modelsForZone(LIBRARY, zoneWith("tanks", "ungrouped")).map((o) => o.slug)).toEqual(["a"]);
  });
  it("returns [] rather than the library", () => {
    expect(modelsForZone(LIBRARY, zoneWith("pumps"))).toEqual([]);
    expect(modelsForZone(LIBRARY, zoneWith())).toEqual([]);
  });
});
