import { describe, expect, it } from "vitest";
import { ALL_PHASES_SHOWN, type PanoramaPhase } from "@/entities/panorama";
import { phaseSections } from "./phase-sections";

const row = (id: number, phase: PanoramaPhase) => ({ id, phase });
const ROWS = [row(1, "prior"), row(2, "post"), row(3, "prior")];

describe("phaseSections", () => {
  it("gives an editor all three phases in order — an empty one is still a place to move to", () => {
    const sections = phaseSections(ROWS, ALL_PHASES_SHOWN, true);
    expect(sections.map((s) => [s.phase, s.label, s.rows.map((r) => r.id)])).toEqual([
      ["prior", "Prior job", [1, 3]],
      ["current", "Current job", []],
      ["post", "Post job", [2]],
    ]);
  });

  it("keeps a hidden phase for an editor, flagged, so it can be shown again", () => {
    const sections = phaseSections(ROWS, { ...ALL_PHASES_SHOWN, post: true }, true);
    expect(sections.find((s) => s.phase === "post")).toMatchObject({ hidden: true, rows: [row(2, "post")] });
  });

  // A hidden phase's rows never reach here for a reader — panoramasTabProps
  // already strips them — so this only has to prove an empty phase drops out.
  it("gives anyone else only the phases that hold something", () => {
    const sections = phaseSections([row(1, "prior")], ALL_PHASES_SHOWN, false);
    expect(sections.map((s) => s.phase)).toEqual(["prior"]);
  });
});
