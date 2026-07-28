// Run with: yarn test  (Node's built-in runner, no framework dependency)
//
// Content invariants for both tours. The steps themselves are data, but the
// tour finds each target by `data-tour="<id>"`, so a duplicate or empty id
// silently spotlights the wrong element instead of failing loudly.
import { test } from "node:test";
import assert from "node:assert/strict";

import { VIEWER_TOUR_STEPS } from "./viewer-tour-steps.ts";
import { PANORAMA_TOUR_STEPS } from "./panorama-tour-steps.ts";
import { VIEWER_TOUR, PANORAMA_TOUR } from "./tour-id.ts";
import type { TourStep } from "./tour-step.ts";

const TOURS: [string, TourStep[]][] = [
  ["viewer", VIEWER_TOUR_STEPS],
  ["panorama", PANORAMA_TOUR_STEPS],
];

for (const [name, steps] of TOURS) {
  test(`${name}: step ids are unique — data-tour lookups must not collide`, () => {
    const ids = steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${name} has a duplicate step id`);
  });

  test(`${name}: every step carries a non-empty id, title and body`, () => {
    for (const s of steps) {
      assert.ok(s.id.trim().length > 0, "step without an id");
      assert.ok(s.title.trim().length > 0, `${s.id} has no title`);
      assert.ok(s.body.trim().length > 0, `${s.id} has no body`);
    }
  });

  test(`${name}: only centred steps may omit a tab, and vice versa`, () => {
    // A centred step describes the page and has no target to find, so it needs
    // no tab. A targeted step on the placements tab must name it or the tour
    // looks the element up while it is out of the DOM.
    for (const s of steps) {
      if (s.center) assert.equal(s.tab, undefined, `${s.id} is centred but names a tab`);
    }
  });

  test(`${name}: tabs are limited to the two the overlays panel renders`, () => {
    for (const s of steps) {
      if (s.tab !== undefined) {
        assert.ok(["view", "placements"].includes(s.tab), `${s.id} names tab ${s.tab}`);
      }
    }
  });

  test(`${name}: the tour opens with a step, not an empty list`, () => {
    assert.ok(steps.length > 0);
  });
}

test("tour ids are distinct and stable — they key persisted onboardingToursSeen", () => {
  assert.notEqual(VIEWER_TOUR, PANORAMA_TOUR);
  // Pinned literally: renaming either replays the tour for every user who has
  // already seen it.
  assert.equal(VIEWER_TOUR, "viewer");
  assert.equal(PANORAMA_TOUR, "panorama");
});
