import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname);

/** Wiring and tooling, not units under test. */
const EXEMPT = new Set([
  "src/main.tsx",
  "src/cosmos.decorator.tsx",
  "src/shared/lib/test-setup.ts",
]);

const isBarrel = (file: string) => basename(file) === "index.ts";
const isTestOrFixture = (file: string) =>
  /\.(spec|fixture)\.tsx?$/.test(file) || file.endsWith("architecture.spec.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (file: string) => `src/${file.slice(SRC.length + 1)}`;

const sources = walk(SRC)
  .filter((f) => [".ts", ".tsx"].includes(extname(f)))
  .filter((f) => !isTestOrFixture(f) && !isBarrel(f))
  .filter((f) => !EXEMPT.has(rel(f)));

const specFor = (file: string) => {
  const stem = file.slice(0, -extname(file).length);
  return [`${stem}.spec.ts`, `${stem}.spec.tsx`].find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
};

describe("every module carries its own spec", () => {
  it("finds sources to check at all — a broken walk must not pass silently", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(sources.map((f) => [rel(f), f]))("%s", (_label, file) => {
    expect(specFor(file), `${rel(file)} has no neighbouring *.spec.ts(x)`).toBeDefined();
  });
});

describe("every shared/ui slice carries a Cosmos fixture", () => {
  const uiRoot = join(SRC, "shared", "ui");
  const slices = readdirSync(uiRoot).filter((entry) =>
    statSync(join(uiRoot, entry)).isDirectory(),
  );

  it("finds slices to check", () => {
    expect(slices.length).toBeGreaterThan(10);
  });

  it.each(slices)("%s", (slice) => {
    const files = readdirSync(join(uiRoot, slice));
    expect(
      files.some((f) => f.endsWith(".fixture.tsx")),
      `shared/ui/${slice} has no *.fixture.tsx`,
    ).toBe(true);
  });
});

describe("layer dependencies point inward only", () => {
  // app -> pages -> widgets -> features -> entities -> shared
  const ORDER = ["shared", "entities", "features", "widgets", "pages", "app"];

  const layerOf = (file: string) => {
    const parts = rel(file).split("/");
    return parts[1] && ORDER.includes(parts[1]) ? parts[1] : null;
  };

  it.each(sources.map((f) => [rel(f), f]))("%s", (_label, file) => {
    const layer = layerOf(file);
    if (!layer) return;

    const imports = [...readFileSync(file, "utf8").matchAll(/from\s+"@\/([a-z-]+)\//g)].map(
      (m) => m[1],
    );

    for (const imported of imports) {
      if (!ORDER.includes(imported)) continue;
      expect(
        ORDER.indexOf(imported),
        `${rel(file)} (${layer}) imports from ${imported}, which is not below it`,
      ).toBeLessThanOrEqual(ORDER.indexOf(layer));
    }
  });
});

describe("shared/ui slices do not import each other's internals", () => {
  it.each(sources.filter((f) => rel(f).startsWith("src/shared/ui/")).map((f) => [rel(f), f]))(
    "%s",
    (_label, file) => {
      const slice = rel(file).split("/")[3];
      const deep = [...readFileSync(file, "utf8").matchAll(/from\s+"@\/shared\/ui\/([^"]+)"/g)]
        .map((m) => m[1])
        .filter((target) => target.includes("/") && target.split("/")[0] !== slice);

      expect(deep, `${rel(file)} reaches past a sibling slice's index.ts`).toEqual([]);
    },
  );
});

describe("the layout has no stray files", () => {
  it("keeps every source inside a known layer", () => {
    const strays = sources.map(rel).filter((f) => {
      const layer = f.split("/")[1];
      return !["shared", "entities", "features", "widgets", "pages", "app"].includes(layer);
    });
    expect(strays).toEqual([]);
  });

  it("puts nothing directly in a layer root — everything lives in a slice", () => {
    const flat = sources.map(rel).filter((f) => f.split("/").length < 4);
    expect(flat).toEqual([]);
  });
});
