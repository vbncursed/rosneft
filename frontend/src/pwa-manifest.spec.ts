import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// The manifest is a static file now (public/manifest.webmanifest), not a Next
// route. These guards mirror the old manifest.test.ts against the static JSON.
const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

test("declares the app installable", () => {
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.name?.length).toBeGreaterThan(0);
  // short_name is truncated on the home-screen tile.
  expect(manifest.short_name?.length).toBeLessThanOrEqual(12);
});

test("carries both icons needed to install, and they exist on disk", () => {
  const icons = manifest.icons ?? [];
  // Vector scales losslessly to both a 16px tab favicon and an Android tile.
  const svg = icons.find((i: { type: string; sizes: string }) => i.type === "image/svg+xml" && i.sizes === "any");
  // iPadOS doesn't support vector icons — it needs the raster.
  const png = icons.find((i: { type: string; sizes: string }) => i.sizes === "180x180" && i.type === "image/png");
  expect(svg).toBeDefined();
  expect(png).toBeDefined();
  expect(existsSync(`public${svg.src}`)).toBe(true);
  expect(existsSync(`public${png.src}`)).toBe(true);
});

test("uses no forbidden brand word", () => {
  const text = JSON.stringify(manifest).toLowerCase();
  expect(text).not.toContain("rosneft");
  expect(text).not.toContain("роснефт");
});
