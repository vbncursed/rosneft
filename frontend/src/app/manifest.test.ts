import { test } from "node:test";
import assert from "node:assert/strict";
import manifest from "./manifest.ts";

test("объявляет приложение устанавливаемым", () => {
  const m = manifest();
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.ok(m.name && m.name.length > 0, "name обязателен для установки");
  assert.ok(m.short_name && m.short_name.length <= 12, "short_name режется на плитке");
});

test("несёт обе иконки, нужные для установки", () => {
  const icons = manifest().icons ?? [];
  const sizes = icons.map((i) => i.sizes);
  assert.ok(sizes.includes("512x512"), "512 нужен Android и десктопу");
  assert.ok(sizes.includes("180x180"), "180 нужен iPadOS");
});

test("не упоминает запрещённое бренд-слово", () => {
  const text = JSON.stringify(manifest()).toLowerCase();
  assert.ok(!text.includes("rosneft"), "бренд — Andrey");
  assert.ok(!text.includes("роснефт"), "бренд — Andrey");
});
