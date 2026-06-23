# Panorama scene markers — design

**Date:** 2026-06-23
**Status:** approved (design), pending implementation plan

## Problem

A territory can have several anchored panoramas, each with a scene
`position`. Today the only way to switch into a panorama is the picker
dropdown. We want an in-scene affordance: a marker at each panorama's
position, showing the panorama's title on hover and entering that panorama
on click.

## Behaviour (decided)

- **Marker visual:** a camera-facing (billboard) glowing cyan dot, drawn
  over scene geometry (depthTest off, high renderOrder) like the measure
  tool's overlay. The title appears in a drei `<Html>` label above the dot
  only while hovered.
- **Which panoramas:** all of them, including ones still at the origin
  `(0,0,0)` (no GPS yet). Overlap at the origin is accepted.
- **Click:** `orchestration.activate(id)` — the existing behaviour that
  enters the panorama view and opens its calibration panel (same as the
  picker).
- **Visibility:** markers render only in the 3D scene view — hidden while
  inside a panorama (`activePanorama != null`) and while in measure mode
  (so they don't intercept measurement clicks).
- **No deselect on click:** marker `onClick` calls `stopPropagation()` so
  the canvas `onPointerMissed` deselect doesn't fire.

## Architecture (frontend only)

A new R3F layer inside `<SceneCanvas>`'s `<Canvas>`, parallel to
`PlacementsLayer` / `MeasurementLayer`. No backend, no data fetching —
positions and titles come from the `panoramas` list already in
`ModelViewer` (from `usePanoramas`), and `activate` already exists on
`usePanoramaOrchestration`.

### New components — `panorama/presentation/three/`

- **`panorama-marker.tsx`** — one marker for one panorama.
  - Props: `{ panorama: Panorama; onActivate: (id: number) => void }`.
  - drei `<Billboard>` wrapping: a small cyan disc/sphere
    (`meshBasicMaterial`, `depthTest={false}`, `renderOrder={999}`,
    `transparent`) plus a slightly larger invisible sphere as a comfortable
    click/hover target.
  - Local `hovered` state: `onPointerOver` → `stopPropagation()`,
    `setHovered(true)`, set `document.body.style.cursor = "pointer"`;
    `onPointerOut` → `setHovered(false)`, restore cursor.
  - When `hovered`, render a drei `<Html>` (center, offset above the dot)
    showing `panorama.title` in the existing glass chip style
    (`border-cyan-300/40 bg-black/80 text-cyan-100`, etc.).
  - `onClick` → `stopPropagation()` + `onActivate(panorama.id)`.
  - Position: `[panorama.position.x, panorama.position.y, panorama.position.z]`.
- **`panorama-markers-layer.tsx`** — maps the list to markers.
  - Props: `{ panoramas: Panorama[]; onActivate: (id: number) => void }`.
  - Renders a `<PanoramaMarker key={p.id} panorama={p} onActivate={onActivate} />`
    per panorama.

### Modified files

- **`viewer/presentation/three/scene-canvas.tsx`** — add props
  `panoramas: Panorama[]` and `onActivatePanorama: (id: number) => void`;
  render the layer only in 3D view and outside measure mode:
  `{!activePanorama && !measureMode && (<PanoramaMarkersLayer
  panoramas={panoramas} onActivate={onActivatePanorama} />)}`.
- **`viewer/presentation/components/model-viewer.tsx`** — pass
  `panoramas={panoramas}` and `onActivatePanorama={panorama.activate}` to
  `SceneCanvas`.

## Data flow

```
ModelViewer (panoramas, panorama.activate)
  → SceneCanvas(panoramas, onActivatePanorama)
      → {!activePanorama && !measureMode} PanoramaMarkersLayer(panoramas, onActivate)
          → PanoramaMarker per panorama
              hover → <Html> title ; click → onActivate(id)
                → orchestration.activate(id) → activePanorama set
                  → markers layer unmounts, panorama sphere + panel mount
```

## Error handling / edge cases

- No data dependencies, so no fetch/error states.
- Markers at `(0,0,0)` may overlap — accepted by decision.
- Fixed world-size dot shrinks when zoomed far out; the hover label remains
  the primary cue. Distance-based constant-screen-size scaling is **out of
  scope** for this iteration.
- Marker hover/click must `stopPropagation()` to avoid interfering with
  placement deselect and selection.

## Testing

The frontend has no test runner and this feature is visual/interaction
only (positions come directly from `panorama.position`, no pure logic to
unit test). Verification: `yarn lint` + `yarn build`, then manual check in
the viewer — markers appear in 3D view at each panorama, hover shows the
title, click enters the panorama; markers disappear inside a panorama and
in measure mode.

## Out of scope

- Constant-screen-size (distance-scaled) markers.
- Editing/deleting a panorama from its marker (done from the panel).
- Showing markers while inside a panorama or in measure mode.
- Any backend change.
- File-size cap: each new/changed file stays under the 200-line limit.
