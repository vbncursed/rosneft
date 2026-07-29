// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { labelFor, shortId } from "./ref-label.ts";

const refs = {
  "role_id:9b75ebfc-141b-448e-ad63-97fe7ca6fa47": "Редактор",
  "model_id:7": "pump-01",
};

test("находит подпись по имени поля и значению", () => {
  assert.equal(labelFor(refs, "role_id", "9b75ebfc-141b-448e-ad63-97fe7ca6fa47"), "Редактор");
});

test("число приводится к строке — снимок хранит id каталога числом", () => {
  assert.equal(labelFor(refs, "model_id", 7), "pump-01");
});

test("промах возвращает null, а не пустую строку", () => {
  // Пустая строка нарисовалась бы вместо id; null означает «показывай id».
  assert.equal(labelFor(refs, "role_id", "unknown"), null);
});

test("null и undefined подписи не имеют", () => {
  assert.equal(labelFor(refs, "model_id", null), null);
  assert.equal(labelFor(refs, "model_id", undefined), null);
});

test("объект не ключ — вложенный трансформ подписи не имеет", () => {
  assert.equal(labelFor(refs, "model_id", { x: 1 }), null);
});

test("одно значение под разными полями не путается", () => {
  // Ключ несёт имя поля, поэтому territory_id:7 и model_id:7 — разные записи.
  const both = { "model_id:7": "pump-01", "territory_id:7": "severnoe" };
  assert.equal(labelFor(both, "model_id", 7), "pump-01");
  assert.equal(labelFor(both, "territory_id", 7), "severnoe");
});

test("uuid режется до восьми символов, число остаётся целым", () => {
  assert.equal(shortId("9b75ebfc-141b-448e-ad63-97fe7ca6fa47"), "9b75ebfc");
  assert.equal(shortId(7), "7");
});
