# Panorama overlay calibration — design

**Date:** 2026-06-23
**Status:** approved (design), pending implementation plan

## Problem

A 360° panorama only lines up with the 3D scene (placements, model
features) when its anchor `position` is exactly the photo's capture point
and its `yawOffset` matches the photo's real orientation. With imprecise
EXIF GPS, those are not known, so placed objects appear in the wrong
direction and at the wrong apparent size *in the panorama* even though they
are correct on the 3D model. Calibrating with the existing numeric fields
(blind) is impractical.

## Goal

An **overlay calibration mode**: show the 3D model with the panorama photo
rendered semi-transparently over it, camera locked at the anchor (rotate to
look around), and live controls to adjust anchor position + yaw + photo
opacity until the photo's features land on the model. Save persists the
calibration.

## Decisions

- **Camera:** locked at the anchor, rotate-only (same as normal panorama
  view); judged from the capture point, which is the only place the photo
  is geometrically valid.
- **Controls (full set):** photo-opacity slider; live position nudge
  (on-screen ± buttons per axis with a selectable step); yaw as a slider +
  a numeric degrees input; "Set from camera"; Save / Exit.
- **Live draft:** while calibrating, the sphere + camera render from an
  unsaved draft (`position`, `yawOffset`) updated by the controls in real
  time; Save writes the draft to the panorama.

## Architecture (frontend only)

A calibration sub-mode layered on the existing panorama orchestration. No
backend change — Save reuses the existing `updatePanorama` path.

### New units

- **`panorama/application/use-panorama-calibration.ts`** — owns calibration
  state for the panorama currently being edited.
  - State: `calibrating: boolean`, `draft: { position: Vec3; yawOffset:
    number } | null`, `opacity: number` (default `0.5`).
  - Actions: `start()` (seed `draft` from the editing panorama, set
    `calibrating`), `cancel()`, `save()` (calls the injected
    `onSave(id, draft)` then clears), `setYaw(rad)`, `nudge(axis: "x" |
    "y" | "z", delta: number)`, `setOpacity(o)`, `setPosition(pos)` (for
    "Set from camera").
  - Derived: `effective: Panorama | null` — `calibrating && editing`
    returns `{ ...editing, position: draft.position, yawOffset:
    draft.yawOffset }`, else `null`.
- **`panorama/presentation/components/panorama-calibration-panel.tsx`** —
  the calibration controls panel (rendered while `calibrating`): opacity
  slider, per-axis nudge grid (± with a step selector), yaw slider + degrees
  input, "Set from camera", Save, Exit. Reuses the app's glass/cyan tokens.

### Modified units

- **`panorama/presentation/three/panorama-sphere.tsx`** — add an
  `opacity?: number` prop (default `1`). When `< 1`: `transparent`,
  `depthTest={false}`, high `renderOrder`, so the equirect ghosts over the
  opaque model. When `1`: unchanged opaque skybox.
- **`panorama/presentation/three/panorama-rig.tsx`** — split behaviour:
  enter/exit keyed on panorama **id** (teleport to anchor, forward target,
  disable zoom/pan, restore on exit — as today); plus a separate effect on
  the anchor **position** that, on a nudge, moves the camera and the orbit
  target to the new anchor **while preserving the current look direction**
  (so fine adjustments don't reset the view). Yaw never moves the camera.
- **`viewer/presentation/three/scene-canvas.tsx`** — add props
  `calibrating: boolean` and `panoramaOpacity: number`. Territory group is
  visible when `!activePanorama || calibrating`. The sphere receives
  `opacity={calibrating ? panoramaOpacity : 1}`. Markers stay gated off
  while `activePanorama` is set (includes calibration).
- **`viewer/presentation/components/model-viewer.tsx`** — compose
  `usePanoramaCalibration` (fed the editing panorama + `updatePanoramaState`
  as `onSave`). Pass `effective ?? panorama.activePanorama` to `SceneCanvas`
  as `activePanorama`, plus `calibrating` and `panoramaOpacity`.
- **`panorama/presentation/components/panorama-edit-panel.tsx`** — add a
  "Calibrate (overlay)" button that calls `start()`.
- **`panorama/presentation/components/panorama-section.tsx`** — when
  `calibrating`, render `PanoramaCalibrationPanel` instead of the normal
  edit panel; wire the calibration props.

## Data flow

```
edit panel "Calibrate" → calibration.start()
  → draft seeded from editing panorama; activePanorama := effective
  → SceneCanvas: territory visible + sphere(opacity) at draft pose; camera at anchor
  → controls mutate draft live (nudge / yaw / opacity / set-from-camera)
  → Save → updatePanoramaState(id, draft) → list updates → calibrating := false
```

## Error handling / edge cases

- Closing the panel (X) or Exit clears `calibrating` and `draft` — unsaved
  changes are discarded (Save is explicit).
- Placements remain visible during calibration (they are the alignment
  reference).
- The only network op is Save, via the existing optimistic
  `updatePanorama` (rollback + toast on failure).
- Switching the editing panorama while calibrating cancels calibration
  (draft belongs to one panorama).
- Opacity is clamped to a sane range (e.g. `0.15`–`1`) so the photo never
  fully disappears mid-calibration.

## Testing

No frontend test runner. Pure logic — the `nudge` reducer and the
`effective` merge — is verified with a `node --experimental-strip-types`
script (e.g. nudging `x` by `+0.01` twice yields `+0.02`; `effective`
overlays draft onto the base panorama). Everything else: `yarn lint` +
`yarn build` + manual check (enter calibration, ghost photo over model,
align via yaw + nudge, Save, confirm the placement now matches in the
panorama).

## Out of scope

- Free-orbit calibration (camera stays at the anchor).
- Auto-alignment / feature matching.
- Keyboard-only nudging (on-screen buttons are the primary control; a step
  selector covers fine vs coarse).
- Any backend or schema change.
- File-size cap: calibration controls live in their own component to keep
  every file under 200 lines.
