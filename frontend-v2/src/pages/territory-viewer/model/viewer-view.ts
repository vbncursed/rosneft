import type { ViewerError } from "@/features/lod";
import type { ViewerMode } from "@/features/viewer-mode";
import { shortDate } from "@/shared/lib/short-date";

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

/** What a reader without the editor role is told, in the header's right cluster. */
export const GUEST_SENTENCE = "You can look and measure.";

export const ERROR_TITLE = "The territory mesh could not be loaded";

/** Both bodies end the same way: the failure is the download, not the scene. */
const ERROR_TAIL =
  "The scene, placements and documents are intact — only the artifact download failed.";

/** The four grants the viewer's chrome turns on. `replace` is `territory:write`. */
export type Grants = { create: boolean; write: boolean; delete: boolean; replace: boolean };

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
}): HeaderPill[] {
  const pills: HeaderPill[] = [];
  // A failure replaces "ready" rather than joining it: the bundle answered, so
  // `ready` is true, but there is no mesh on screen and saying both is a lie.
  if (a.failed) pills.push({ tone: "bad", label: FAILED_PILL });
  else if (a.ready) pills.push({ tone: "ok", label: READY_PILL });

  const { create, write, delete: canDelete } = a.grants;
  if (!create && !write && !canDelete) pills.push({ tone: "neutral", label: READ_ONLY_PILL });
  else if (write && !canDelete) pills.push({ tone: "neutral", label: NO_DELETE_PILL });

  if (a.mode === "measure") pills.push({ tone: "accent", label: MEASURING_PILL });
  if (a.tourActive) pills.push({ tone: "accent", label: TOUR_PILL });
  return pills;
}

/** The mono line under the title: which territory, how many levels, in what units. */
export const headerMeta = (slug: string, lods: number, units: string) =>
  `${slug} · ${lods} LODs · ${units}`;

export type RailTool = "reset" | "measure" | "add" | "tour";
export type RailToolState = { key: RailTool; state: "active" | "idle" | "inert" };

/**
 * The tool rail's tiles and how each is drawn.
 *
 * Without geometry every tile is inert, the tour included — the mock's error
 * state draws it that way, and a tour that walks a reader through controls
 * pointing at a mesh that never loaded would be worse than no tour at all.
 * `add` is absent rather than disabled for a reader who cannot create: the
 * mock's rule is that missing grants remove controls, they do not grey them.
 */
export function railTools(a: {
  grants: Grants;
  mode: ViewerMode;
  geometry: boolean;
}): RailToolState[] {
  const keys: RailTool[] = a.grants.create
    ? ["reset", "measure", "add", "tour"]
    : ["reset", "measure", "tour"];
  const activeKey: RailTool | null =
    a.mode === "orbit" ? "reset" : a.mode === "measure" ? "measure" : "add";

  return keys.map((key) => ({
    key,
    state: !a.geometry ? "inert" : key === activeKey ? "active" : "idle",
  }));
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

/** The View tab's `uploaded` row. Nothing recorded, and nothing guessed. */
export const uploadedLine = (iso: string | null): string => shortDate(iso ?? undefined) ?? "—";
