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
  // Вектор: масштабируется без потерь и во вкладку 16 px, и в плитку Android.
  assert.ok(
    icons.some((i) => i.type === "image/svg+xml" && i.sizes === "any"),
    "нужен масштабируемый вектор",
  );
  // iPadOS вектор в иконках не поддерживает — ему обязателен растр.
  assert.ok(
    icons.some((i) => i.sizes === "180x180" && i.type === "image/png"),
    "180x180 PNG нужен iPadOS",
  );
});

test("не упоминает запрещённое бренд-слово", () => {
  const text = JSON.stringify(manifest()).toLowerCase();
  assert.ok(!text.includes("rosneft"), "бренд — Andrey");
  assert.ok(!text.includes("роснефт"), "бренд — Andrey");
});
