# PDF Viewer with Layers — Design Spec

**Date:** 2026-06-26
**Status:** Approved design, pending implementation plan
**Context:** Follows the territory-PDF-documents feature. The current `DocumentView`
shows the PDF in a fullscreen `<iframe>` pointed at `/api/assets/{hash}`, using the
browser's built-in viewer. That viewer can't toggle PDF layers (OCG) and janks on
heavy files.

## Goal

Give the in-app PDF viewer a full feature set — zoom, page navigation, search,
print, download — **and** the ability to toggle PDF layers (Optional Content
Groups) on/off. Achieved by self-hosting pdf.js's prebuilt viewer; almost no
custom rendering code.

## Approach (chosen)

Vendor pdf.js's prebuilt generic viewer as static assets (the same pattern this
repo already uses for the self-hosted Draco and Basis/KTX2 decoders under
`frontend/public/`). Open the PDF in an iframe pointed at the vendored
`viewer.html`:

```
/pdfjs/web/viewer.html?file=<encoded /api/assets/{hash}>
```

pdf.js provides zoom, page nav, **search, print, download, and a Layers sidebar
with OCG checkboxes** out of the box. It also virtualizes pages (renders only
the visible ones), which should scroll smoother than the browser's built-in
viewer on heavy files.

Rejected alternative: a custom pdf.js viewer (render to `<canvas>`, hand-build
toolbar/search/print/layers). Full styling control but re-implements what the
prebuilt viewer already provides — far more code and risk for no functional gain.

## Asset vendoring

**Note (corrected during implementation):** the npm `pdfjs-dist@6` package no
longer ships the prebuilt standalone viewer (`web/viewer.html`) — only the
component library + runtime. The full viewer lives in the GitHub release
`pdfjs-<ver>-dist.zip`. So we vendor from the release, committed (like
`public/draco/` and `public/basis/`), not generated from `node_modules`.

- Download `pdfjs-<ver>-dist.zip` from the pdf.js GitHub release; extract `build/`
  and `web/` into `frontend/public/pdfjs/` (the zip's own layout: `viewer.html`
  at `web/viewer.html` resolves `../build/pdf.mjs`, `./standard_fonts/`, etc.).
- Trim to keep size reasonable (~7 MB): delete `*.map`, `*.min.mjs`,
  `build/pdf.sandbox.mjs`, `web/debugger.*`, CJK `web/cmaps/`, and all
  `web/locale/*` except `en-US`. Keep `web/wasm/` (on-demand JPEG2000/JBIG2/ICC
  decoders) and `web/standard_fonts/` so non-embedded fonts and scanned images
  render.
- **Commit** `frontend/public/pdfjs/` to the repo. No npm dependency, no build
  script, no build-time network — robust in Docker (the runner stage already
  copies `/app/public`).

## DocumentView change

- Change the iframe `src` from `assetUrl(hash)` to
  `/pdfjs/web/viewer.html?file=${encodeURIComponent(assetUrl(hash))}`.
  The blob is same-origin (relative URL), which pdf.js's viewer permits.
- Keep the existing fullscreen behavior: portal to `<body>`, `fixed inset-0`,
  and the parent `display:none` of the 3D chrome while open (the prior perf fix).
- Keep a thin top bar with only **Exit** (returns to the scene; also Esc) and
  **Delete** (gated by `document:delete`). Download / print / search / zoom /
  layers all live inside the pdf.js toolbar and sidebar — drop our own Download
  button to avoid duplication.

## Layers

No custom code. pdf.js's viewer shows a **Layers** entry in its sidebar whenever
the PDF contains Optional Content Groups, with a checkbox per layer. The default
on/off state comes from the PDF's own default OCG configuration; the user toggles
from there.

## Risks / things to verify

- **`.mjs` MIME type:** the prebuilt viewer is ES-module based (`viewer.mjs`,
  `pdf.mjs`, `pdf.worker.mjs`). Next.js must serve `.mjs` from `public/` as
  `text/javascript`/`application/javascript`, or the modules won't load. Verify
  in the production container; if wrong, add a `headers()` rule in
  `next.config` for `/pdfjs/:path*.mjs`.
- **pdfjs-dist version:** pin a recent stable that ships the prebuilt `web/viewer.html`.
- **Same-origin file check:** `?file=` must stay a same-origin relative URL.

## Testing

No frontend test infra — verify via `yarn build` + manual: open a layered PDF,
toggle entries in the Layers sidebar, zoom, search, print, Download, Exit (and
Esc). Confirm `.mjs` loads in the production container (no console MIME errors).
Deploy = rebuild the `frontend` service.

## Out of scope

- Theming the pdf.js viewer to the app's dark palette (it uses its standard,
  prefers-color-scheme-aware UI).
- Per-user persistence of layer toggle state.
