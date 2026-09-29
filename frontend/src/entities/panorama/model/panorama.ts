import type { Vec3 } from "@/entities/placement";

/** The job a capture was taken for (D2): three fixed phases, never renamed, never "none". */
export type PanoramaPhase = "prior" | "current" | "post";

/** An equirect photo anchored at `position` in scene units; `yawOffset` turns the sphere, `defaultYaw` is where a reader first looks. Both radians. */
export type Panorama = {
  id: number;
  territorySlug: string;
  slug: string;
  title: string;
  sourceBlobHash: string;
  position: Vec3;
  yawOffset: number;
  defaultYaw: number;
  /** The 256×128 JPEG the server made from the equirect; null until it has, and the row draws the glyph. */
  thumbnailBlobHash: string | null;
  /** The job phase it is listed under; `prior` until an editor moves it (D3). */
  phase: PanoramaPhase;
  /** Hidden on its own, for everyone (D1, D4); its phase has a flag of its own. */
  hidden: boolean;
  updatedAt: string;
};

export type PanoramaCreate = { title: string; sourceBlobHash: string; position?: Vec3; yawOffset?: number };

/** Every field, every time: the gateway's PUT replaces the row and zeroes what is absent. */
export type PanoramaUpdate = { title: string; position: Vec3; yawOffset: number; defaultYaw: number };

/** The mock's "not calibrated yet": nothing has moved the anchor off the origin. */
export const isCalibrated = (p: Panorama): boolean =>
  p.position.x !== 0 || p.position.y !== 0 || p.position.z !== 0 || p.yawOffset !== 0;

/** Whether each phase is hidden for everyone — the phase's own flag (D5). */
export type PhaseHidden = Record<PanoramaPhase, boolean>;

/** The three phases in list order, with the words the View tab prints (D2). */
export const PANORAMA_PHASES: readonly { phase: PanoramaPhase; label: string }[] = [
  { phase: "prior", label: "Prior job" },
  { phase: "current", label: "Current job" },
  { phase: "post", label: "Post job" },
];

/** No phase hidden: a territory nobody has touched. Copy, never mutate. */
export const ALL_PHASES_SHOWN: PhaseHidden = { prior: false, current: false, post: false };

/** On the map only when neither it nor its phase is hidden (D5). */
export const isPanoramaShown = (p: Pick<Panorama, "hidden" | "phase">, phaseHidden: PhaseHidden): boolean =>
  !p.hidden && !phaseHidden[p.phase];
