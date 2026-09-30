import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ALL_PHASES_SHOWN, type Panorama, type PhaseHidden } from "@/entities/panorama";
import { basePageParts } from "../territory-viewer-page.fixture";
import { panoramasTabProps } from "./page-props-panoramas";
import type { PageParts } from "./viewer-props";

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "refinery-block-c",
  slug: `capture-${id}`,
  title: `Capture ${id}`,
  sourceBlobHash: `p${id}`,
  position: { x: 1, y: 0, z: 2 },
  yawOffset: 0,
  defaultYaw: 0,
  thumbnailBlobHash: null,
  updatedAt: "2026-09-14T10:00:00Z",
  phase: "prior",
  hidden: false,
  ...over,
});

const LIST = [panorama(1), panorama(2, { hidden: true }), panorama(3, { phase: "post" })];
const POST_HIDDEN: PhaseHidden = { ...ALL_PHASES_SHOWN, post: true };

const parts = (write: boolean): PageParts => {
  const p = basePageParts();
  return {
    ...p,
    grants: { ...p.grants, panoramaWrite: write },
    panoramas: { ...p.panoramas, list: LIST, visibility: { ...p.panoramas.visibility, phaseHidden: POST_HIDDEN } },
  };
};

describe("panoramasTabProps", () => {
  it("lists an editor every capture — a hidden one and a hidden phase's included — with its phase and flag", () => {
    const rows = panoramasTabProps(parts(true), null).rows;
    expect(rows.map((r) => [r.id, r.phase, r.hidden])).toEqual([
      [1, "prior", false],
      [2, "prior", true],
      [3, "post", false],
    ]);
  });

  it("lists anyone else only what the map draws", () => {
    expect(panoramasTabProps(parts(false), null).rows.map((r) => r.id)).toEqual([1]);
  });

  it("hands the phase flags, the pending state and the three writes straight through", () => {
    const p = parts(true);
    const { phases } = panoramasTabProps(p, null);
    const v = p.panoramas.visibility;
    expect(phases.hidden).toBe(POST_HIDDEN);
    expect(phases.canWrite).toBe(true);
    expect(phases.pendingIds).toBe(v.pendingIds);
    expect(phases.pendingPhases).toBe(v.pendingPhases);
    expect(phases.onSetHidden).toBe(v.onSetHidden);
    expect(phases.onMove).toBe(v.onMove);
    expect(phases.onSetPhaseHidden).toBe(v.onSetPhaseHidden);
    expect(panoramasTabProps(parts(false), null).phases.canWrite).toBe(false);
  });

  it("puts the anchor card it is handed under the rows", () => {
    const card = createElement("div");
    expect(panoramasTabProps(parts(true), card).editor).toBe(card);
  });

  it("hands the just-added id and its ack straight through, so the phase list can open and clear it", () => {
    const p = parts(true);
    const withId = { ...p, panoramas: { ...p.panoramas, justAddedId: 3 } };
    expect(panoramasTabProps(withId, null).phases.justAddedId).toBe(3);
    expect(panoramasTabProps(withId, null).phases.onJustAddedSeen).toBe(p.panoramas.onJustAddedSeen);
    expect(
      panoramasTabProps({ ...p, panoramas: { ...p.panoramas, justAddedId: null } }, null).phases.justAddedId,
    ).toBeNull();
  });

  it("hands the stored marker choice and its setter to the View tab", () => {
    const p = parts(true);
    const props = panoramasTabProps({ ...p, panoramas: { ...p.panoramas, markers: "points" } }, null);
    expect(props.markers).toBe("points");
    expect(props.onMarkers).toBe(p.panoramas.onMarkers);
  });
});
