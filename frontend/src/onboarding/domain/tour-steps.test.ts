// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { PANORAMA_TOUR_STEPS } from "./panorama-tour-steps.ts";
import { VIEWER_TOUR_STEPS } from "./viewer-tour-steps.ts";
import type { TourStep } from "./tour-step.ts";

const SRC = path.resolve(import.meta.dirname, "../..");
const TOURS: [string, TourStep[]][] = [
  ["viewer", VIEWER_TOUR_STEPS],
  ["panorama", PANORAMA_TOUR_STEPS],
];

// Every data-tour="..." literal in the app, ignoring the tour's own
// `[data-tour="${step.id}"]` selector (a template hole matches no letters).
function anchorsInSource(): Set<string> {
  const out = execFileSync("grep", ["-rho", 'data-tour="[a-z-]*"', SRC], {
    encoding: "utf8",
  });
  return new Set([...out.matchAll(/data-tour="([a-z-]+)"/g)].map((m) => m[1]));
}

for (const [name, steps] of TOURS) {
  // A duplicate id inside one tour makes `[data-tour="<id>"]` ambiguous, so the
  // tour would spotlight whichever element comes first in the document.
  test(`${name}: every step id is unique`, () => {
    const ids = steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test(`${name}: every step carries an id, a title and a body`, () => {
    for (const step of steps) {
      assert.ok(step.id.length > 0, `empty id`);
      assert.ok(step.title.length > 0, `empty title on ${step.id}`);
      assert.ok(step.body.length > 0, `empty body on ${step.id}`);
    }
  });

  // A centred step has no anchor to reveal, so pairing it with a tab would
  // switch the panel for nothing.
  test(`${name}: centred steps declare no tab`, () => {
    for (const step of steps) {
      if (step.center) assert.equal(step.tab, undefined, `${step.id} has both`);
    }
  });
}

// Nothing else couples a step to its button: a renamed id or a dropped
// attribute leaves the step permanently, silently skipped. TypeScript cannot
// see across that gap, so assert it here, across every tour at once.
test("every anchored step has a matching data-tour attribute, and vice versa", () => {
  const anchors = anchorsInSource();
  const anchored = new Set(
    TOURS.flatMap(([, steps]) => steps.filter((s) => !s.center).map((s) => s.id)),
  );

  for (const id of anchored) {
    assert.ok(anchors.has(id), `step "${id}" has no data-tour="${id}" in the app`);
  }
  for (const anchor of anchors) {
    assert.ok(anchored.has(anchor), `data-tour="${anchor}" matches no tour step`);
  }
});
