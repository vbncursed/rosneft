import { describe, expect, it } from "vitest";
import type { ViewerError } from "@/features/lod";
import {
  ERROR_TITLE,
  GUEST_SENTENCE,
  errorCopy,
  headerMeta,
  headerPills,
  railTools,
  uploadedLine,
  type Grants,
} from "./viewer-view";

const OWNER: Grants = { create: true, write: true, delete: true, replace: true };
const EDITOR: Grants = { create: true, write: true, delete: false, replace: false };
const GUEST: Grants = { create: false, write: false, delete: false, replace: false };

const pills = (over: Partial<Parameters<typeof headerPills>[0]> = {}) =>
  headerPills({ ready: true, grants: OWNER, mode: "orbit", tourActive: false, failed: false, ...over });

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
});

describe("headerMeta", () => {
  it("joins the slug, the chain length and the units", () => {
    expect(headerMeta("refinery-block-c", 3, "metres")).toBe("refinery-block-c · 3 LODs · metres");
  });
});

describe("GUEST_SENTENCE", () => {
  it("says what a reader without the editor role can still do", () => {
    expect(GUEST_SENTENCE).toBe("You can look and measure.");
  });
});

describe("railTools", () => {
  const tools = (over: Partial<Parameters<typeof railTools>[0]> = {}) =>
    railTools({ grants: OWNER, mode: "orbit", geometry: true, ...over });

  it("lights Reset while the pointer orbits a loaded scene", () => {
    expect(tools()).toEqual([
      { key: "reset", state: "active" },
      { key: "measure", state: "idle" },
      { key: "add", state: "idle" },
      { key: "tour", state: "idle" },
    ]);
  });

  it("lights Measure and dims Reset in measure mode", () => {
    expect(tools({ mode: "measure" })).toEqual([
      { key: "reset", state: "idle" },
      { key: "measure", state: "active" },
      { key: "add", state: "idle" },
      { key: "tour", state: "idle" },
    ]);
  });

  it("lights Add objects in place mode", () => {
    expect(tools({ mode: "place" }).find((t) => t.key === "add")).toEqual({
      key: "add",
      state: "active",
    });
  });

  it("drops Add entirely for a reader who cannot create placements", () => {
    expect(tools({ grants: GUEST }).map((t) => t.key)).toEqual(["reset", "measure", "tour"]);
  });

  it("makes every tile inert without geometry — the tour included, per the mock's error state", () => {
    expect(tools({ geometry: false })).toEqual([
      { key: "reset", state: "inert" },
      { key: "measure", state: "inert" },
      { key: "add", state: "inert" },
      { key: "tour", state: "inert" },
    ]);
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
  it("prints the short date", () => {
    expect(uploadedLine("2026-09-04T09:00:00Z")).toBe("04.09");
  });

  it("prints an em-dash rather than guessing when nothing was recorded", () => {
    expect(uploadedLine(null)).toBe("—");
  });

  it("prints an em-dash for a date it cannot read", () => {
    expect(uploadedLine("not a date")).toBe("—");
  });
});
