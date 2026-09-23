import { useCallback, useEffect, useRef, useState } from "react";
import type { Panorama, PanoramaUpdate, SourceBbox } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import {
  NUDGE_STEPS,
  useMarkerSwitch,
  usePanoramaCalibration,
  usePanoramaDrag,
  usePanoramaList,
  usePanoramaTexture,
  usePanoramaView,
  type PanoramaViewMode,
  type TextureDecoder,
} from "@/features/panorama-view";
import { usePanoramaUpload } from "@/features/panorama-upload";
import { useTerritoryLink } from "@/features/territory-link";
import type { PanoramaParts } from "./overlay-parts";
import type { Section } from "./reveal-section";

export type ViewerPanoramasParams = {
  slug: string;
  /**
   * The bundle's panoramas, seeded once. The page does NOT re-key this hook on
   * a refetch — see `use-territory-viewer.ts` for why, and for what that costs.
   */
  initial: Panorama[];
  mode: PanoramaViewMode;
  /** The reducer's move sub-mode — the one source of truth for it. */
  moving: boolean;
  /** The territory's source bbox, for anchoring an upload from its EXIF GPS. */
  sourceBbox: SourceBbox | null;
  externalUrl: string | undefined;
  onChanged: () => void;
  /** Opens a folded section — a finished upload must not land in a hidden list. */
  reveal: (section: Section) => void;
  decode: TextureDecoder;
};

/** Med: fine enough to settle a capture on a doorway, coarse enough to be felt. */
const DEFAULT_STEP = NUDGE_STEPS[1].value;

/**
 * Every panorama hook the viewer page needs, composed into one slice.
 *
 * The page holds the state that *decides* — where the camera is, which anchor
 * is being edited, whether markers are being dragged — in the viewer-mode
 * reducer; this hook holds what that state operates on, and writes every
 * change through `usePanoramaList`, which is optimistic and tells the page to
 * refetch. So a drag, a calibration and the anchor card's Save are three ways
 * into one PUT rather than three paths that can disagree.
 */
export function useViewerPanoramas({
  slug,
  initial,
  mode,
  moving,
  sourceBbox,
  externalUrl,
  onChanged,
  reveal,
  decode,
}: ViewerPanoramasParams): PanoramaParts {
  const list = usePanoramaList({ slug, initial, onChanged });
  // The list hook hands back a new object every render; every callback below
  // depends on its *members*, which are `useCallback`s and do not move. A
  // dependency on the object itself would give the canvas a fresh
  // `onMarkerDrop` on every render the page does — one per keystroke in the
  // panel — and the drag controller re-binds its window listeners on each.
  const { add, update, remove } = list;
  const view = usePanoramaView(list.panoramas, mode);

  const saveCalibration = useCallback(
    (id: number, patch: { position: Vec3; yawOffset: number }) => void update(id, patch),
    [update],
  );
  const calibration = usePanoramaCalibration(view.editing, saveCalibration);

  // One drop, two meanings. While an alignment is open the marker is the
  // anchor being calibrated, so the release edits the draft the calibration
  // card shows and `Save` / `Exit` keep meaning what they say; in the move
  // sub-mode it is the write itself.
  const { calibrating, setPosition } = calibration;
  const commitDrag = useCallback(
    (id: number, position: Vec3) => {
      if (calibrating) setPosition(position);
      else void update(id, { position });
    },
    [calibrating, setPosition, update],
  );
  const drag = usePanoramaDrag(commitDrag);
  // One source of truth for the sub-mode: the reducer owns it, so leaving it
  // drops whatever the drag was holding — without committing it.
  //
  // A calibration drag never enters that sub-mode: it runs with `moving`
  // false from grab to release, so this condition is true for the whole of it
  // and only the stability of `moving` and `reset` keeps the effect from
  // firing mid-drag. Both are stable by construction (`reset` is a
  // `useCallback` over a `useCallback` over nothing) — do not give this effect
  // a dependency that moves, or the calibration drag cancels itself.
  const { reset } = drag;
  useEffect(() => {
    if (!moving) reset();
  }, [moving, reset]);

  // Inside a capture the photo is the one the reader is standing in. From the
  // 3D view an open alignment still needs its equirect — it is the ghosted
  // backdrop the anchor is lined up against — and there is no active capture
  // out there to key it on.
  const texture = usePanoramaTexture(
    (view.active ?? calibration.effective)?.sourceBlobHash ?? null,
    decode,
  );
  const markers = useMarkerSwitch();
  const link = useTerritoryLink(slug, externalUrl);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [step, setStep] = useState<number>(DEFAULT_STEP);
  // The camera writes both on every frame it moves; the anchor card reads them
  // when "Set from camera" is pressed, and neither is state anything renders.
  const cameraPositionRef = useRef<Vec3 | null>(null);
  const cameraYawRef = useRef<number | null>(null);

  const upload = usePanoramaUpload({
    slug,
    sourceBbox,
    onCreated: useCallback(
      (panorama: Panorama) => {
        add(panorama);
        onChanged();
        reveal("panoramas");
        setUploadOpen(false);
      },
      [add, onChanged, reveal],
    ),
  });

  const { activate, startEdit, closeEdit, toggleView } = view;
  const onExit = useCallback(() => activate(null), [activate]);
  const openUpload = useCallback(() => setUploadOpen(true), []);
  const closeUpload = useCallback(() => setUploadOpen(false), []);

  const editingId = view.editing?.id ?? null;
  const onSave = useCallback(
    (patch: PanoramaUpdate) => {
      if (editingId !== null) void update(editingId, patch);
    },
    [editingId, update],
  );
  // Deleting the card's subject closes the card: the row is gone, and a header
  // that still reads "editing anchor" would be pointing at nothing. And if the
  // reader is standing inside that capture, it walks them out first — the
  // sphere unmounts on its own (the lookup finds nothing) but the reducer's
  // view does not, and every pill, tile and footer would go on describing a
  // panorama over a 3D scene.
  const activeId = view.active?.id ?? null;
  const onDelete = useCallback(() => {
    if (editingId === null) return;
    if (activeId === editingId) activate(null);
    void remove(editingId);
    closeEdit();
  }, [activeId, editingId, activate, remove, closeEdit]);

  return {
    list: list.panoramas,
    pendingId: list.pendingId,
    active: view.active,
    editing: view.editing,
    index: view.index,
    texture,
    showMarkers: markers.showMarkers,
    onToggleMarkers: markers.toggle,
    drag,
    calibration: {
      active: calibration.calibrating,
      effective: calibration.effective,
      draft: calibration.draft,
      opacity: calibration.opacity,
      step,
      onOpacity: calibration.setOpacity,
      onStep: setStep,
      onNudge: calibration.nudge,
      onYaw: calibration.setYaw,
      onStart: calibration.start,
      onSave: calibration.save,
      onExit: calibration.cancel,
    },
    onEnter: activate,
    onExit,
    onCycle: view.cycle,
    onEdit: startEdit,
    onCloseEditor: closeEdit,
    onToggleView: toggleView,
    onSave,
    onDelete,
    link: { url: link.url, saving: link.saving, onSave: link.save },
    upload: { open: uploadOpen, onOpen: openUpload, onClose: closeUpload, form: upload },
    cameraPositionRef,
    cameraYawRef,
  };
}
