import type { ViewerError } from "@/features/lod";
import type { ViewerMode, ViewerView } from "@/features/viewer-mode";
import { longDate } from "@/shared/lib/short-date";
import { can, type Principal } from "@/shared/session";

/**
 * Every string the viewer's chrome prints, in one place: the fixtures, the
 * specs and the live page all read the same constant, so a wording change is
 * one edit rather than four that drift.
 */
export const READY_PILL = "ready";
export const FAILED_PILL = "artifact unavailable";
export const READ_ONLY_PILL = "viewer · read-only";
export const NO_DELETE_PILL = "editor · can move, cannot delete";
export const MEASURING_PILL = "measuring";
export const TOUR_PILL = "guided tour";
export const PANORAMA_PILL = "panorama";
export const EDITING_PILL = "panorama · editing anchor";

/** The header's meta line while a PDF is over the scene — it replaces the LOD line. */
export const DOC_OPEN_META = "document overlay open";
export const DOC_EXPANDED_META = "document overlay expanded";

/** What a reader without the editor role is told, in the header's right cluster. */
export const GUEST_SENTENCE = "You can look, measure and open documents.";

export const ERROR_TITLE = "The territory mesh could not be loaded";

/** Both bodies end the same way: the failure is the download, not the scene. */
const ERROR_TAIL =
  "The scene, placements and documents are intact — only the artifact download failed.";

/**
 * Every grant the viewer's chrome turns on. The first four are the placement
 * ones (`replace` is `territory:write`, which also owns the tour link); the
 * next are package B's overlays, where creating a panorama and editing one are
 * separate grants because uploading a capture and moving its anchor are
 * separate jobs; the last three are the saved measurements'.
 */
export type Grants = {
  create: boolean;
  write: boolean;
  delete: boolean;
  replace: boolean;
  panoramaCreate: boolean;
  panoramaWrite: boolean;
  panoramaDelete: boolean;
  documentWrite: boolean;
  documentDelete: boolean;
  measureCreate: boolean;
  measureWrite: boolean;
  measureDelete: boolean;
};

/** What `me` may do on this page — `null` (not answered yet) may do nothing. */
export const grantsOf = (me: Principal | null): Grants => ({
  create: can(me, "placement:create"),
  write: can(me, "placement:write"),
  delete: can(me, "placement:delete"),
  replace: can(me, "territory:write"),
  panoramaCreate: can(me, "panorama:create"),
  panoramaWrite: can(me, "panorama:write"),
  panoramaDelete: can(me, "panorama:delete"),
  documentWrite: can(me, "document:write"),
  documentDelete: can(me, "document:delete"),
  measureCreate: can(me, "measurement:create"),
  measureWrite: can(me, "measurement:write"),
  measureDelete: can(me, "measurement:delete"),
});

/** The three measurement grants, in the shape the sync plan reads. */
export const measureGrants = (g: Grants) => ({
  create: g.measureCreate,
  write: g.measureWrite,
  delete: g.measureDelete,
});

/** The Clear question (spec M-4); `count` is the saved chains, the only ones it cannot take back. */
export const clearTitle = (count: number) =>
  count === 1
    ? "Delete 1 measurement on this territory?"
    : `Delete all ${count} measurements on this territory?`;

export type HeaderPill = { tone: "ok" | "accent" | "neutral" | "bad"; label: string };

/**
 * The pills beside the title, in reading order: what the scene is, what this
 * reader may do to it, and what is happening right now.
 *
 * The grant pill names the *limit*, never the permission — a reader who holds
 * everything is told nothing, because a pill that says "you may do everything"
 * is noise on every screen it appears on.
 */
export function headerPills(a: {
  ready: boolean;
  grants: Grants;
  mode: ViewerMode;
  tourActive: boolean;
  failed: boolean;
  /** Where the camera is; inside a panorama the pills say so. */
  view: ViewerView;
  /** An anchor card is open on this panorama. */
  editing: boolean;
}): HeaderPill[] {
  const pills: HeaderPill[] = [];
  // A failure replaces "ready" rather than joining it: the bundle answered, so
  // `ready` is true, but there is no mesh on screen and saying both is a lie.
  if (a.failed) pills.push({ tone: "bad", label: FAILED_PILL });
  else if (a.ready) pills.push({ tone: "ok", label: READY_PILL });

  const { create, write, delete: canDelete } = a.grants;
  if (!create && !write && !canDelete) pills.push({ tone: "neutral", label: READ_ONLY_PILL });
  else if (write && !canDelete) pills.push({ tone: "neutral", label: NO_DELETE_PILL });

  // Inside a panorama the two states are one pill, never two: the edit is of
  // the capture the camera is already in, and saying both names it twice. In
  // the 3D scene the card is in plain sight on the panel and needs no pill.
  if (a.view.kind === "panorama") {
    pills.push({ tone: "accent", label: a.editing ? EDITING_PILL : PANORAMA_PILL });
  }

  if (a.mode === "measure") pills.push({ tone: "accent", label: MEASURING_PILL });
  if (a.tourActive) pills.push({ tone: "accent", label: TOUR_PILL });
  return pills;
}

/** The mono line under the title: which territory, how many levels, in what units. */
export const headerMeta = (slug: string, lods: number, units: string) =>
  `${slug} · ${lods} LODs · ${units}`;

export type RailTool = "reset" | "play" | "measure" | "add" | "panoramas" | "documents" | "tour";
export type RailToolState = { key: RailTool; state: "active" | "idle" | "inert" };

type RailInputs = {
  grants: Grants;
  mode: ViewerMode;
  geometry: boolean;
  loading: boolean;
  tourActive: boolean;
  view: ViewerView;
  documentOpen: boolean;
  /** The camera is flying around the territory. */
  playing: boolean;
};

/**
 * The tool rail's tiles and how each is drawn.
 *
 * Without geometry every tile is inert, the tour included — the mock's error
 * state draws it that way — **except Panoramas and Documents**: a capture and
 * a PDF are served from BlobStore and are as readable with no mesh on screen
 * as with one. `add` is absent rather than disabled for a reader who cannot
 * create: the mock's rule is that missing grants remove controls, they do not
 * grey them.
 *
 * `loading` is state 3 — the coarse level is up, the target is not — where the
 * mock draws "reset; others dim". `tourActive` lights nothing at all: the tour
 * is explaining these controls, and a lit tile inside a dimmed page reads as
 * the step's own anchor. Inside a panorama (state 8) Measure, Add objects and
 * Play are inert: none has a mesh to work against.
 *
 * Play (spec §2) lights on its own, beside the mode's tile, and circles the
 * mesh from orbit mode only — a pointer mode is using the view. A download
 * never dims it: a level on screen is a level to circle, and a flight caught
 * mid-download has to stay stoppable from its tile.
 */
export function railTools(a: RailInputs): RailToolState[] {
  const keys: RailTool[] = a.grants.create
    ? ["reset", "play", "measure", "add", "panoramas", "documents", "tour"]
    : ["reset", "play", "measure", "panoramas", "documents", "tour"];
  const inside = a.view.kind === "panorama";
  const activeKey: RailTool | null = a.tourActive
    ? null
    : inside
      ? "panoramas"
      : a.documentOpen
        ? "documents"
        : a.mode === "orbit"
          ? "reset"
          : a.mode === "measure"
            ? "measure"
            : "add";

  return keys.map((key) => ({ key, state: stateOf(key, activeKey, inside, a) }));
}

const NEEDS_MESH: RailTool[] = ["play", "measure", "add"];

function stateOf(
  key: RailTool,
  activeKey: RailTool | null,
  inside: boolean,
  a: RailInputs,
): RailToolState["state"] {
  // The two overlay tiles are never inert — see the note above.
  if (key === "panoramas" || key === "documents") return key === activeKey ? "active" : "idle";
  if (!a.geometry) return "inert";
  if (inside && NEEDS_MESH.includes(key)) return "inert";
  if (key === "play") return a.mode !== "orbit" ? "inert" : a.playing && !a.tourActive ? "active" : "idle";
  if (key === activeKey) return "active";
  return a.loading ? "inert" : "idle";
}

export type ErrorCopy = {
  title: string;
  body: string;
  footer: string;
  coarseLabel: string | null;
};

const clock = (at: Date) =>
  `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

/**
 * The error card's words. Every fact comes from the level that actually failed
 * — `viewerError` resolved that from the failure's hash, not from the target —
 * so the file name, the level and the offered fallback all name the same mesh.
 *
 * `at` is the reader's own clock, and the footer prints it as a wall time: it
 * answers "how long ago did this last try", which a UTC stamp does not.
 */
export function errorCopy(e: ViewerError, at: Date): ErrorCopy {
  return {
    title: ERROR_TITLE,
    body:
      e.status === null
        ? `The download of the LOD ${e.lod} mesh failed. ${ERROR_TAIL}`
        : `Storage returned ${e.status} for the LOD ${e.lod} mesh. ${ERROR_TAIL}`,
    footer: `${e.file} · last attempt ${clock(at)}`,
    coarseLabel: e.coarser ? `Load coarse LOD ${e.coarser.lod} instead` : null,
  };
}

/**
 * The View tab's `uploaded` row. Nothing recorded, and nothing guessed.
 *
 * The catalog's `dd.mm` helper was reused here at first, which lost the year on
 * the one row whose whole job is the date; the mock spells it `4 Sep 2026`.
 */
export const uploadedLine = (iso: string | null): string => longDate(iso ?? undefined) ?? "—";
