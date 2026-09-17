import { describe, expect, it } from "vitest";
import type { ViewerError } from "@/features/lod";
import type { ViewerView } from "@/features/viewer-mode";
import {
  EDITING_PILL,
  ERROR_TITLE,
  GUEST_SENTENCE,
  clearTitle,
  measureGrants,
  errorCopy,
  headerMeta,
  headerPills,
  PANORAMA_PILL,
  railTools,
  uploadedLine,
  type Grants,
} from "./viewer-view";

const SCENE: ViewerView = { kind: "scene" };
const INSIDE: ViewerView = { kind: "panorama", id: 7 };

const OWNER: Grants = { create: true, write: true, delete: true, replace: true, panoramaCreate: true, panoramaWrite: true, panoramaDelete: true, documentWrite: true, documentDelete: true, measureCreate: true, measureWrite: true, measureDelete: true };
const EDITOR: Grants = { create: true, write: true, delete: false, replace: false, panoramaCreate: true, panoramaWrite: true, panoramaDelete: false, documentWrite: true, documentDelete: false, measureCreate: true, measureWrite: false, measureDelete: false };
const GUEST: Grants = { create: false, write: false, delete: false, replace: false, panoramaCreate: false, panoramaWrite: false, panoramaDelete: false, documentWrite: false, documentDelete: false, measureCreate: false, measureWrite: false, measureDelete: false };

const pills = (over: Partial<Parameters<typeof headerPills>[0]> = {}) =>
  headerPills({
    ready: true,
    grants: OWNER,
    mode: "orbit",
    tourActive: false,
    failed: false,
    view: SCENE,
    editing: false,
    ...over,
  });

describe("headerPills", () => {
  it("gives an owner the ready pill and nothing else — every grant is held", () => {
    expect(pills()).toEqual([{ tone: "ok", label: "ready" }]);
  });

  it("spells out what a write-without-delete editor can do", () => {
    expect(pills({ grants: EDITOR })).toEqual([
      { tone: "ok", label: "ready" },
      { tone: "neutral", label: "editor · can move, cannot delete" },
    ]);
  });

  it("calls a reader with no placement grant a read-only viewer", () => {
    expect(pills({ grants: GUEST })).toEqual([
      { tone: "ok", label: "ready" },
      { tone: "neutral", label: "viewer · read-only" },
    ]);
  });

  it("adds measuring after ready, which stays first", () => {
    expect(pills({ mode: "measure" })).toEqual([
      { tone: "ok", label: "ready" },
      { tone: "accent", label: "measuring" },
    ]);
  });

  it("orders ready, then the grant, then measuring when a guest measures", () => {
    expect(pills({ grants: GUEST, mode: "measure" }).map((p) => p.label)).toEqual([
      "ready",
      "viewer · read-only",
      "measuring",
    ]);
  });

  it("replaces ready with the failure and still reports the running tour", () => {
    expect(pills({ ready: false, failed: true, tourActive: true })).toEqual([
      { tone: "bad", label: "artifact unavailable" },
      { tone: "accent", label: "guided tour" },
    ]);
  });

  it("shows no state pill at all while nothing has answered", () => {
    expect(pills({ ready: false })).toEqual([]);
  });

  it("keeps the failure pill even when the scene also claims to be ready", () => {
    expect(pills({ failed: true })[0]).toEqual({ tone: "bad", label: "artifact unavailable" });
  });

  it("accents the panorama the camera is inside", () => {
    expect(pills({ view: INSIDE })).toEqual([
      { tone: "ok", label: "ready" },
      { tone: "accent", label: PANORAMA_PILL },
    ]);
  });

  it("names the open anchor card instead of the plain panorama pill, never beside it", () => {
    expect(pills({ view: INSIDE, editing: true })).toEqual([
      { tone: "ok", label: "ready" },
      { tone: "accent", label: EDITING_PILL },
    ]);
  });

  it("says nothing about an anchor card open over the 3D scene", () => {
    // The card is on the panel, in plain sight; the pills report where the
    // camera is, and in the scene that is nothing worth a pill.
    expect(pills({ editing: true })).toEqual([{ tone: "ok", label: "ready" }]);
  });
});

describe("headerMeta", () => {
  it("joins the slug, the chain length and the units", () => {
    expect(headerMeta("refinery-block-c", 3, "metres")).toBe("refinery-block-c · 3 LODs · metres");
  });
});

describe("GUEST_SENTENCE", () => {
  it("says what a reader without the editor role can still do", () => {
    expect(GUEST_SENTENCE).toBe("You can look, measure and open documents.");
  });
});

describe("railTools", () => {
  const tools = (over: Partial<Parameters<typeof railTools>[0]> = {}) =>
    railTools({
      grants: OWNER,
      mode: "orbit",
      geometry: true,
      loading: false,
      tourActive: false,
      view: SCENE,
      documentOpen: false,
      ...over,
    });
  const states = (over: Partial<Parameters<typeof railTools>[0]> = {}) =>
    Object.fromEntries(tools(over).map((t) => [t.key, t.state]));

  it("lights Reset while the pointer orbits a loaded scene, in the mock's order", () => {
    expect(tools()).toEqual([
      { key: "reset", state: "active" },
      { key: "measure", state: "idle" },
      { key: "add", state: "idle" },
      { key: "panoramas", state: "idle" },
      { key: "documents", state: "idle" },
      { key: "tour", state: "idle" },
    ]);
  });

  it("lights Measure and dims Reset in measure mode", () => {
    expect(states({ mode: "measure" })).toMatchObject({ reset: "idle", measure: "active" });
  });

  it("lights Add objects in place mode", () => {
    expect(states({ mode: "place" })).toMatchObject({ add: "active", reset: "idle" });
  });

  it("drops Add entirely for a reader who cannot create placements", () => {
    expect(tools({ grants: GUEST }).map((t) => t.key)).toEqual([
      "reset",
      "measure",
      "panoramas",
      "documents",
      "tour",
    ]);
  });

  it("dims everything but the live tile while a level is still downloading", () => {
    // Mock state 3: "reset; others dim" — the scene is on screen but the target
    // is not, and a tool that needs the final mesh is not ready to be pressed.
    // The two overlay tiles stay reachable: a panorama and a PDF are served
    // whatever the mesh is doing.
    expect(states({ loading: true })).toEqual({
      reset: "active",
      measure: "inert",
      add: "inert",
      panoramas: "idle",
      documents: "idle",
      tour: "inert",
    });
  });

  it("leaves every tile idle while the tour runs — the mock lights none of them", () => {
    expect(tools({ tourActive: true }).every((t) => t.state === "idle")).toBe(true);
  });

  it("makes every tile inert without geometry, bar the two overlay tiles", () => {
    expect(states({ geometry: false })).toEqual({
      reset: "inert",
      measure: "inert",
      add: "inert",
      panoramas: "idle",
      documents: "idle",
      tour: "inert",
    });
  });

  it("lights Panoramas inside one, and refuses the two tools that need the mesh", () => {
    // Nothing is measured or placed against a photo; Reset still frames the
    // sphere, and the tour is as replayable as it is anywhere else.
    expect(states({ view: INSIDE })).toEqual({
      reset: "idle",
      measure: "inert",
      add: "inert",
      panoramas: "active",
      documents: "idle",
      tour: "idle",
    });
  });

  it("lights Documents while a document overlay is open", () => {
    expect(states({ documentOpen: true })).toMatchObject({
      documents: "active",
      reset: "idle",
      panoramas: "idle",
    });
  });
});

describe("errorCopy", () => {
  const at = new Date(2026, 8, 9, 14, 22);
  const base: ViewerError = {
    lod: 1,
    status: 502,
    file: "refinery-block-c-lod1.glb",
    coarser: { lod: 2, hash: "h2", size: 10 },
  };

  it("names the status, the level and the file, and offers the coarser level", () => {
    expect(errorCopy(base, at)).toEqual({
      title: ERROR_TITLE,
      body: "Storage returned 502 for the LOD 1 mesh. The scene, placements and documents are intact — only the artifact download failed.",
      footer: "refinery-block-c-lod1.glb · last attempt 14:22",
      coarseLabel: "Load coarse LOD 2 instead",
    });
  });

  it("says the download failed when no status came back", () => {
    expect(errorCopy({ ...base, status: null }, at).body).toBe(
      "The download of the LOD 1 mesh failed. The scene, placements and documents are intact — only the artifact download failed.",
    );
  });

  it("offers no way out when the failed level is the coarsest there is", () => {
    expect(errorCopy({ ...base, coarser: null }, at).coarseLabel).toBeNull();
  });

  it("pads the clock to two digits", () => {
    expect(errorCopy(base, new Date(2026, 8, 9, 9, 5)).footer).toBe(
      "refinery-block-c-lod1.glb · last attempt 09:05",
    );
  });
});

describe("uploadedLine", () => {
  it("prints the mock's date, year and all — this row is the date", () => {
    expect(uploadedLine("2026-09-04T09:00:00Z")).toBe("4 Sep 2026");
  });

  it("prints an em-dash rather than guessing when nothing was recorded", () => {
    expect(uploadedLine(null)).toBe("—");
  });

  it("prints an em-dash for a date it cannot read", () => {
    expect(uploadedLine("not a date")).toBe("—");
  });
});

describe("measureGrants", () => {
  it("reads the three measurement grants in the sync plan's shape", () => {
    expect(measureGrants(OWNER)).toEqual({ create: true, write: true, delete: true });
    expect(measureGrants(EDITOR)).toEqual({ create: true, write: false, delete: false });
  });
});

describe("clearTitle", () => {
  it("asks about every saved chain, in the singular for one", () => {
    expect(clearTitle(3)).toBe("Delete all 3 measurements on this territory?");
    expect(clearTitle(1)).toBe("Delete 1 measurement on this territory?");
  });
});
