# PDF Viewer with Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser's built-in PDF iframe with pdf.js's self-hosted prebuilt viewer so the document view gains zoom, search, print, download, and a layers (OCG) toggle sidebar.

**Architecture:** Vendor pdf.js's prebuilt generic viewer as static assets under `frontend/public/pdfjs/` (same pattern as the repo's self-hosted Draco/Basis decoders), generated at build time by a `prebuild` copy script. `DocumentView` points its fullscreen iframe at `viewer.html?file=<asset url>`; pdf.js supplies the whole feature set including the Layers sidebar.

**Tech Stack:** Next.js 16 (standalone output, Yarn 1.22), `pdfjs-dist`, React 19, TypeScript.

## Global Constraints

- **200-line file cap** (ESLint `max-lines`, skipBlankLines + skipComments).
- **Brand:** displayed text uses "Andrey"; never "Rosneft"/"Роснефть". Lowercase `rosneft` paths are structural.
- **No frontend test framework** — verification is `yarn build` + `curl` + manual browser checks.
- **Self-host pattern:** vendored third-party static assets live under `frontend/public/` (cf. `public/draco/`, `public/basis/`), generated/copied from `node_modules`, not hand-written.
- **Docker build** runs `yarn install --frozen-lockfile` (full deps) then `yarn build`; the runner stage copies `/app/.next/standalone`, `/app/.next/static`, and `/app/public`. Anything the viewer needs must end up under `public/` by the time `next build` finishes.

---

### Task 1: Vendor the pdf.js viewer assets

**Files:**
- Add: `frontend/public/pdfjs/**` (vendored, committed)

**Interfaces:**
- Produces: a `frontend/public/pdfjs/` tree with `web/viewer.html`, `web/viewer.mjs`, `build/pdf.mjs`, `build/pdf.worker.mjs`, served at `/pdfjs/...`.

> **Corrected during execution:** npm `pdfjs-dist@6` no longer ships the standalone
> `viewer.html`; it lives in the GitHub release zip. So we vendor the release files
> committed (no npm dep, no copy script, no gitignore) — matching `public/draco`.

- [x] **Done:** downloaded `pdfjs-6.0.227-dist.zip`, extracted `build/`+`web/` into
  `frontend/public/pdfjs/`, deleted `*.map`, `*.min.mjs`, `build/pdf.sandbox.mjs`,
  `web/debugger.*`, `web/cmaps/`, and `web/locale/*` except `en-US`. Kept `web/wasm/`
  and `web/standard_fonts/`. ~7 MB. Committed `public/pdfjs/`.
---

### Task 2: Point DocumentView at the pdf.js viewer

**Files:**
- Modify: `frontend/src/document/presentation/components/document-view.tsx`

**Interfaces:**
- Consumes: `/pdfjs/web/viewer.html` (Task 1); existing `assetUrl(hash)`.
- Produces: the document view renders the pdf.js viewer; keeps `onClose`/`onDelete` toolbar.

- [ ] **Step 1: Swap the iframe source and trim the toolbar.** pdf.js provides Download/print/search/zoom/layers, so drop the custom Download link; keep only Exit + Delete. Replace the file body of `document-view.tsx` with:

```tsx
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import DeleteButton from "@/shared/presentation/components/delete-button";
import type { Document } from "@/document/domain/document";

interface DocumentViewProps {
  document: Document;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

// DocumentView shows the selected PDF in place of the scene via pdf.js's
// self-hosted viewer (zoom, search, print, download, and a Layers sidebar for
// PDFs with optional content groups). It takes over the whole viewport
// (portaled to <body>, above the z-50 profile avatar) so the avatar and
// overlays panel don't bleed through; Exit (or Esc) returns to the 3D scene.
//
// `?file` is a same-origin relative URL, which the pdf.js viewer permits.
export default function DocumentView({ document, canDelete, onDelete, onClose }: DocumentViewProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof window === "undefined") return null;
  const file = encodeURIComponent(assetUrl(document.sourceBlobHash));
  const src = `/pdfjs/web/viewer.html?file=${file}`;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950">
      <div className="flex items-center gap-3 px-4 py-2 text-sm text-neutral-100">
        <span className="min-w-0 flex-1 truncate font-medium">{document.title}</span>
        {canDelete ? (
          <DeleteButton
            label={document.title}
            onDelete={onDelete}
            className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
          >
            Delete
          </DeleteButton>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          Exit
        </button>
      </div>
      <iframe
        title={document.title}
        src={src}
        className="min-h-0 flex-1 border-0 bg-neutral-900"
      />
    </div>,
    window.document.body,
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `cd frontend && npx eslint src/document/presentation/components/document-view.tsx && npx tsc --noEmit 2>&1 | grep -v "projects/\\[slug\\]" | grep "error TS" || echo "no TS errors"`
Expected: eslint clean; "no TS errors".

- [ ] **Step 3: Commit**

```bash
git add frontend/src/document/presentation/components/document-view.tsx
git commit -m "feat(frontend): render documents via self-hosted pdf.js viewer (zoom/search/print/layers)"
```

---

### Task 3: Verify the viewer loads locally (incl. `.mjs` MIME)

**Files:**
- Possibly modify: `frontend/next.config.ts` (only if `.mjs` is served with a wrong MIME)

**Interfaces:**
- Consumes: vendored assets (Task 1), DocumentView (Task 2).

- [ ] **Step 1: Production build** (runs `prebuild` → repopulates `public/pdfjs/`):

Run: `cd frontend && yarn build 2>&1 | tail -5`
Expected: "Done"/compiled successfully, no errors.

- [ ] **Step 2: Start the production server in the background**

Run: `cd frontend && (yarn start >/tmp/next-start.log 2>&1 &) && sleep 4 && curl -s -o /dev/null -w "viewer.html %{http_code} %{content_type}\n" http://localhost:3000/pdfjs/web/viewer.html`
Expected: `viewer.html 200 text/html…`.

- [ ] **Step 3: Check the `.mjs` modules are served as JavaScript** (the one real risk):

Run: `curl -s -o /dev/null -w "viewer.mjs %{http_code} %{content_type}\n" http://localhost:3000/pdfjs/web/viewer.mjs && curl -s -o /dev/null -w "pdf.worker.mjs %{http_code} %{content_type}\n" http://localhost:3000/pdfjs/build/pdf.worker.mjs`
Expected: both `200` with a JavaScript content-type (`text/javascript` or `application/javascript`).

- [ ] **Step 4: If — and only if — the content-type is NOT a JavaScript type** (e.g. `text/plain` or `application/octet-stream`), add a headers rule. Read `frontend/next.config.ts`, and add an async `headers()` to the exported config (merge with any existing one):

```ts
  async headers() {
    return [
      {
        source: "/pdfjs/:path*.mjs",
        headers: [{ key: "Content-Type", value: "text/javascript" }],
      },
    ];
  },
```

Then re-run Steps 1–3 and confirm the `.mjs` content-type is now a JavaScript type. If Step 3 already passed, skip this step entirely.

- [ ] **Step 5: Stop the local server**

Run: `pkill -f "next start" || true`
Expected: server stops (no error if already gone).

- [ ] **Step 6: Commit (only if `next.config.ts` changed in Step 4)**

```bash
git add frontend/next.config.ts
git commit -m "fix(frontend): serve vendored pdf.js .mjs assets as JavaScript"
```

If `next.config.ts` was not changed, there is nothing to commit for this task.

---

### Task 4: Deploy and verify in production

**Files:** none (operational).

- [ ] **Step 1: Push to main**

Run: `git push origin main`
Expected: refs updated.

- [ ] **Step 2: Deploy the frontend** (prod is `/opt/rosneft`, compose project `andrey`; the Docker build's `prebuild` regenerates `public/pdfjs/` inside the image):

Run:
```bash
ssh root@85.192.26.113 'cd /opt/rosneft && git pull --ff-only && docker compose -p andrey up -d --build frontend'
```
Expected: frontend container rebuilt and started.

- [ ] **Step 3: Verify the viewer assets serve in prod with correct MIME**

Run:
```bash
ssh root@85.192.26.113 'curl -s -o /dev/null -w "viewer.html %{http_code} %{content_type}\nviewer.mjs %{http_code} %{content_type}\nworker %{http_code} %{content_type}\n" http://localhost:3000/pdfjs/web/viewer.html; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/pdfjs/web/viewer.mjs'
```
Expected: `viewer.html` 200 text/html; `viewer.mjs` 200 with a JavaScript content-type. If the `.mjs` MIME is wrong here but was right locally, apply Task 3 Step 4, redeploy, re-verify.

- [ ] **Step 4: Manual browser smoke test** (record results, do not skip):
  - Open a territory, pick a PDF from the **Documents** group in the View dropdown.
  - The pdf.js viewer loads (toolbar with zoom %, search, print, download visible).
  - For a PDF **with layers**: open the sidebar → **Layers** tab → toggle a layer checkbox → the page redraws with that layer hidden/shown.
  - Zoom in/out and scroll — confirm it's smoother than before and no console errors.
  - **Exit** button (and **Esc**) returns to the 3D scene; the scene is intact.
  - As a `document:delete`-capable user, **Delete** removes the document and returns to the scene.

---

## Self-Review

**Spec coverage:**
- Full viewer (zoom/search/print/download) + layer toggling → pdf.js prebuilt viewer (Tasks 1–2). ✓
- Vendor via copy script, gitignored, dep added, runs in Docker → Task 1. ✓
- DocumentView iframe → `viewer.html?file=…`, keep fullscreen portal + `display:none` chrome + thin Exit/Delete bar, drop Download → Task 2. ✓
- Layers free via sidebar → verified in Task 4 Step 4. ✓
- `.mjs` MIME risk with `next.config` fallback → Task 3 (local) + Task 4 Step 3 (prod). ✓
- Same-origin `?file=` → Task 2 (relative `assetUrl`, comment). ✓
- Verify via build + manual → Tasks 3–4. ✓

**Placeholder scan:** No TBD/TODO; every code step has full content; the only conditional is Task 3 Step 4 (explicitly gated on a measured MIME result, with exact code). ✓

**Type consistency:** `DocumentView` keeps its existing props (`document`, `canDelete`, `onDelete`, `onClose`) — unchanged from the current call site in `model-viewer.tsx`, so no caller update needed. `assetUrl(hash: string): string` used as today. ✓
