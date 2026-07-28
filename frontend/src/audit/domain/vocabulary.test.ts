// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { ENTITIES, SESSION_ENTITY, actionsFor } from "./vocabulary.ts";

test("every audited entity is listed", () => {
  // Десять сущностей от триггеров плюс session от гейтвея. Прошлый список в
  // audit-filters содержал восемь и пропускал три связующие таблицы — по ним
  // отфильтровать было нельзя вовсе.
  assert.equal(ENTITIES.length, 11);
  for (const e of [
    "territory",
    "model",
    "placement",
    "territory_assignment",
    "panorama",
    "document",
    "user",
    "user_role",
    "role",
    "role_permission",
    "session",
  ]) {
    assert.ok(ENTITIES.includes(e), `missing ${e}`);
  }
});

test("a trigger entity has exactly its three operations", () => {
  assert.deepEqual(actionsFor("territory"), [
    "territory.insert",
    "territory.update",
    "territory.delete",
  ]);
  assert.deepEqual(actionsFor("role_permission"), [
    "role_permission.insert",
    "role_permission.update",
    "role_permission.delete",
  ]);
});

test("no action is ever named .create", () => {
  // Триггер строит действие как lower(TG_OP), то есть insert. Угаданное
  // "territory.create" молча возвращало пустой журнал — именно это дропдаун и
  // должен предотвращать, так что промах в словаре сводит его на нет.
  for (const action of actionsFor("")) {
    assert.ok(!action.endsWith(".create"), `${action} must not exist`);
  }
});

test("session carries the auth events, not insert/update/delete", () => {
  const actions = actionsFor(SESSION_ENTITY);
  assert.equal(actions.length, 10);
  for (const a of actions) {
    assert.ok(a.startsWith("auth."), `${a} should be an auth event`);
  }
  assert.ok(actions.includes("auth.login"));
  assert.ok(actions.includes("auth.passkey_delete"));
});

test("an empty entity means every action", () => {
  const all = actionsFor("");
  // 10 сущностей × 3 операции + 10 событий auth.
  assert.equal(all.length, 40);
  assert.ok(all.includes("territory.update"));
  assert.ok(all.includes("auth.login_2fa"));
});

test("actionsFor never returns duplicates", () => {
  const all = actionsFor("");
  assert.equal(new Set(all).size, all.length);
});
