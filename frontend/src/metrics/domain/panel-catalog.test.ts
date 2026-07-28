// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { view, STAT_IDS, SECTIONS } from "./panel-catalog.ts";

const LAID_OUT = [...STAT_IDS, ...SECTIONS.flatMap((s) => s.panelIds)];

test("every laid-out panel id resolves — the dashboard cannot render a hole", () => {
  // view() throws on an unknown id, so a typo in STAT_IDS or SECTIONS would
  // crash the whole route rather than drop one tile.
  for (const id of LAID_OUT) assert.doesNotThrow(() => view(id), `${id} is not in META`);
});

test("view returns the id alongside the title and unit", () => {
  assert.deepEqual(view("stat-rps"), { id: "stat-rps", title: "Requests/sec", unit: "rps" });
});

test("view throws on an unknown id instead of rendering an untitled tile", () => {
  assert.throws(() => view("stat-does-not-exist"), /unknown panel/);
});

test("no panel id is laid out twice", () => {
  assert.equal(new Set(LAID_OUT).size, LAID_OUT.length);
});

test("every section carries a title and at least one panel", () => {
  for (const s of SECTIONS) {
    assert.ok(s.title.length > 0, "section without a title");
    assert.ok(s.panelIds.length > 0, `section ${s.title} is empty`);
  }
});

test("the stat row is the five tiles the dashboard header expects", () => {
  assert.equal(STAT_IDS.length, 5);
  for (const id of STAT_IDS) assert.ok(id.startsWith("stat-"), `${id} is not a stat tile`);
});
