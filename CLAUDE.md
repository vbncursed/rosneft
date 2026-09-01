# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before committing Go changes

Run `make -C backend check` — gofmt, `go mod tidy` drift, `GOWORK=off go vet`,
golangci-lint, `go test -race -shuffle=on`, govulncheck. ~80 s. `.githooks/pre-commit`
runs it for you once `make -C backend hooks` has been run in the clone. Rationale for
the two non-obvious steps (`vet` and `tidy-check` both run with the workspace off, and
catch Docker-build failures that `make lint` cannot see): [`backend/CLAUDE.md`](backend/CLAUDE.md#the-commit-gate).

# Frontend is a Vite + React SPA (no Next.js)

The frontend is a client-only single-page app: Vite 8 + React 19, routed with
`@tanstack/react-router` (route tree in `src/routes/`) and served data through
`@tanstack/react-query`. There is no server runtime, no RSC, no App Router.
Entry point is `src/main.tsx`. Check the installed versions in
`frontend/node_modules/@tanstack/*` when an API looks unfamiliar.

**Never write `"use client"`.** It marks a server/client boundary that does not
exist here; every module is already client-side and the bundler ignores it. 62
files carried it as migration residue and were cleaned out — don't reintroduce
it by copying a neighbouring file.

## Commands

All commands run from `frontend/`:

```bash
yarn dev          # Vite dev server (http://localhost:3000, /api proxied to the gateway)
yarn build        # Production build → dist/
yarn preview      # Serve the production build locally
yarn lint         # tsc --noEmit + oxlint (.oxlintrc.json)
yarn test         # Domain unit tests (node --test, src/**/*.test.ts)
yarn test:spa     # Component/integration tests (vitest, src/**/*.spec.ts[x])
```

## Stack

- **Vite 8 + React 19** SPA. Routing: `@tanstack/react-router` (`src/routes/`). Data: `@tanstack/react-query`. Entry: `src/main.tsx`.
- **TypeScript 7** (the native port) strict mode, bundler module resolution. Single path alias `@/*` → `frontend/src/*`.
- **Tailwind CSS 4** via `@tailwindcss/postcss` — uses `@import "tailwindcss"` and `@theme inline` syntax, not v3 `@tailwind` directives
- **oxlint** (`.oxlintrc.json`), not ESLint — typescript-eslint refuses to load under TypeScript 7, so the flat config could not run at all. The rule set deliberately mirrors what ESLint enforced (unicorn off) so the swap changed the engine, not the policy. **Keep the config strict JSON: no comments** — an editor's JSON validator flags them, and `.jsonc` falls off oxlint's default discovery so the editor extension would silently lint with its own rules. Rationale per rule: [`frontend/README.md#linting`](frontend/README.md#linting).

## Architecture rules (hard)

- **Clean Architecture + DDD**. Every file lives in one of four layers under a bounded context: `domain/`, `application/`, `infrastructure/`, `presentation/`.
- **Hard cap: 200 lines per file** (skipBlankLines, skipComments). Enforced by oxlint. Generated files are exempted explicitly.
- **No speculative abstractions, no dead code, no helpers "just in case"** — only what the current task requires.
- Dependencies point strictly inward: `domain ← application ← presentation`. Domain imports nothing outward; application never imports presentation. Presentation talks to `application/` use cases or an `infrastructure/` gateway that already returns domain entities — never DTO types.
- DTO→domain mapping happens inside gateways; openapi-typescript output is treated as an internal implementation detail.

### Allowed exceptions to layering

- **`territory/` aggregates `placement/` domain types in the SceneBundle response.** `territory-gateway.ts` imports `Placement` and `PlacementAssetOption` from `@/placement/domain` because `SceneBundle` is the server-side aggregate that joins territory + artifact + placements + model options in one call. This is the only sanctioned cross-context domain import; do not extend it to other contexts.

## UI animations

UI animations use the `motion` library (import from `motion/react` — never `framer-motion`). Shared variant/transition presets, a reduced-motion helper, and reusable wrappers (`MotionOverlay`, `MotionModal`, `MotionDrawer`, `MotionList`/`MotionItem`) live in `@/shared/presentation/motion/`; import them from there rather than inlining variants or hand-rolling `AnimatePresence` per component. `motion` is **presentation-only** — never import it in `domain/`, `application/`, or `infrastructure/`. Every animated surface must respect `prefers-reduced-motion` via `useResolvedVariants` (its pure core `resolveVariants` is unit-tested). Keep animated files under the 200-line cap by leaning on the wrappers; extract a sub-section rather than inlining motion mechanics.

## Project layout

```
frontend/
  src/
    main.tsx                            # entry: QueryClientProvider + RouterProvider
    globals.css                         # Tailwind entry + self-hosted fonts
    routes/                             # TanStack Router route tree (client-only)
      router.tsx, root.tsx, layout.tsx  # tree + authed layout guard
      login.tsx, home.tsx, territory-viewer.tsx, territories.tsx, models.tsx,
      model-detail.tsx, *-new.tsx, account.tsx                 # each exports a route
      admin.tsx, admin-users.tsx, admin-roles.tsx, admin-metrics.tsx, ...
      guard.ts                          # redirect-to-login / permission guards
    shared/
      domain/{vec3.ts, lod-artifact.ts, artifact.ts, job.ts}
      infrastructure/
        api/dto.ts                      # openapi-typescript output (autogen, lint-exempt)
        http/{client.ts, http-error.ts, ...}
        query/query-client.ts
        asset-url.ts
      application/{lod-url.ts, toast/{notify.ts, toast-store.ts, toast.ts}}
      presentation/toast/toaster.tsx    # React Toaster; the store lives in application
    territory/                          # bounded context: parent scenes
      domain/{territory.ts, scene-bundle.ts}
      infrastructure/territory-gateway.ts
    model/                              # bounded context: placeable assets
      domain/model.ts
      infrastructure/model-gateway.ts
    upload/                             # bounded context: chunked uploads (tus-style)
      domain/session.ts
      infrastructure/upload-gateway.ts
      application/use-chunked-upload.ts
      presentation/components/{upload-form.tsx, field.tsx, progress-bar.tsx}
    placement/                          # bounded context: scene overlays
      domain/{placement.ts, transform.ts, mutation-state.ts,
              gizmo-mode.ts, asset-option.ts}
      application/use-placements-editor.ts
      infrastructure/placement-gateway.ts
      presentation/
        components/{placements-panel.tsx, placement-row.tsx,
                    placement-form.tsx, create-placement-row.tsx,
                    mode-toggle.tsx, vec3-field.tsx, empty-state.tsx}
        three/{placement-instance.tsx, placements-layer.tsx}
    measurement/                        # bounded context: measure tool
      domain/{measurement.ts, distance.ts, unit-ratio.ts}
      application/use-measurement-tool.ts
      presentation/
        components/measure-button.tsx
        three/{measurement-layer.tsx, measurement-segment.tsx, point-marker.tsx}
    viewer/                             # bounded context: 3D scene composition
      domain/model-metadata.ts
      application/use-keyboard-shortcuts.ts
      presentation/
        components/{model-viewer.tsx, viewer-entry.tsx, viewer-skeleton.tsx,
                    ui-overlay.tsx, model-info-panel.tsx,
                    loading-progress.tsx, reset-camera-button.tsx}
        three/{scene-canvas.tsx, gltf-model.tsx, camera-rig.tsx, lighting.tsx,
               gltf-loader-setup.ts}
    conversion/                         # bounded context: pending conversion screen
      application/{use-conversion-watcher.ts, use-job-stream.ts}
      presentation/conversion-pending.tsx
    panorama/                           # equirect panorama tours + scene markers
    document/                           # PDF overlays anchored to a territory
    auth/                               # login, session marker, RBAC, passkeys, 2FA, admin console
    metrics/                            # owner-only Prometheus dashboard
    audit/                              # bounded context: the change journal
      domain/{audit-entry.ts, diff.ts}  # diff.ts is pure — node --test
      infrastructure/audit-gateway.ts
      application/use-audit-log.ts      # useInfiniteQuery, cursor paging
      presentation/components/          # panel, table, row, filters, diff, export
    onboarding/                         # guided tour
    app-shell/  login/                  # top-level layout + login screen
```

`@/*` resolves to `frontend/src/*`. Route modules in `src/routes/` are client components: they read params/search, call TanStack Query (or a gateway), and render each context's `presentation/`.

## Key conventions

- Tailwind v4 syntax: `@theme inline` block for design tokens, `@import "tailwindcss"` instead of `@tailwind base/components/utilities`
- oxlint config is `.oxlintrc.json` (comments allowed). There is no `eslint.config.mjs` any more — do not add one back.
- Two test runners: pure domain logic → `node --test` (`*.test.ts`); jsdom/React → vitest (`*.spec.ts[x]`). Globs don't overlap.
- Client env is `VITE_API_URL` — **empty in both dev and prod**. nginx serves the SPA and proxies `/api` in production; Vite's dev server proxies `/api` by default in development. Single origin is not a convenience: it is what lets the httpOnly session cookie ride on `<img>`, the pdf.js `<iframe>` and three.js loader requests, none of which can carry an Authorization header. `VITE_DEV_PROXY` overrides the dev target. Dev runs on port **3000** — `PASSKEY_RP_ORIGINS` is pinned to it.

## Desktop shell (`desktop/`)

Tauri v2 wrapper around the same SPA. A loopback axum server inside the Rust
process serves the embedded `frontend/dist` through `app.asset_resolver()` and
proxies `/api` to the gateway, reproducing production's nginx topology. That is
deliberate and load-bearing: the frontend is single-origin by design — the
session cookie has to ride on three.js loader requests, the pdf.js `<iframe>`
and `EventSource`, none of which can carry a header — so anything that changes
the origin breaks asset loading while login still appears to work.

- **Never point the webview at a remote URL directly.** `tauri://localhost` is
  cross-site to the gateway, `SameSite=Lax` withholds the cookie, and models,
  PDFs and SSE all fail while the login screen looks fine.
- **The loopback port is fixed (`17817`), and that is load-bearing.** The
  webview's origin is `http://127.0.0.1:<port>`, `localStorage` is partitioned
  by origin, and the SPA's session marker (`andrey.authed`) lives in it — so an
  ephemeral port handed the router guard an empty store on every launch and
  bounced the user to `/login` while a perfectly good session sat in the
  proxy's jar. It also threw away the WebKit HTTP cache, IndexedDB and the
  service worker each start. The number is below every platform's ephemeral
  range (Linux 32768–60999, macOS/Windows 49152–65535) so the kernel cannot
  hand it out; `DESKTOP_PORT` overrides it for a dev build running beside an
  installed one, **and switches the single-instance plugin off** — that plugin
  locks on `/tmp/{identifier}_si.sock`, the bundle identifier alone, so it
  cannot tell the two apart and would `exit(0)` the dev build before it bound
  anything. If the port is taken, `bind_loopback` falls back to an ephemeral one
  and logs a warning — one login, which is the old behaviour, not a broken
  window.
- The session cookie never reaches the webview: the proxy holds it in a jar and
  strips `Set-Cookie`, storing the token in the OS keychain.
- **The loopback port is gated by a per-run nonce, and the gate is keyed on the
  path prefix, never on `spa::classify`.** `classify` answers `Route::Index` for
  any path whose last segment has no dot — and no `/api` path has one — so a
  gate that classified first waved the entire authenticated gateway session
  through with no cookie: `/api/territories` and `/api/auth/me` answered **200**
  to any local process. `server.rs`'s `dispatch()` checks `/api/` first and
  unconditionally. Any new response path that bypasses it opens that session
  again.
- **The nonce is handed to the webview out of band, in the URL `main.rs` opens
  it with (`?dsk=…`), and only a request carrying it in the query gets the
  cookie.** Setting the cookie on every `index.html` response made the guard a
  two-request formality — `GET /` handed the nonce to any caller. `GET /` with
  no query still returns `index.html`, deliberately *without* a cookie, so a
  stray navigation gets a shell whose subresources all 403 rather than an error
  that would brick the window; a reload of a deep router path carries no query
  but does carry the cookie set on the first load.
- **`reqwest` must keep its `gzip`/`brotli`/`deflate` features, and the
  webview's `Accept-Encoding` must keep being dropped in `filtered_request`.**
  The gateway compresses every JSON response; without the features reqwest
  hands the compressed bytes on and `client.ts` throws `SyntaxError` on
  `res.json()` — every route, the whole product. This survived eight reviews
  because every live check used plain `curl`, which sends no `Accept-Encoding`
  and so got an uncompressed answer. **Verify proxy behaviour with the headers a
  webview actually sends.** It is now a test rather than a warning:
  `proxy::tests::decodes_a_compressed_upstream_body_and_drops_content_encoding`
  drives a gzipped upstream through `send()` with `Accept-Encoding: br, gzip`
  and fails if the body arrives still encoded. In reqwest 0.13 the TLS feature
  was renamed `rustls-tls` → `rustls`; the three decoding features kept their
  names, so a careless rename can still silently drop them.
- **The CSP is keyed on the response's content type, not on `is_index`.** A CSP
  header binds one document and an iframe does not inherit its parent's, so
  gating on the index left the other two HTML documents this bundle ships —
  `offline.html` and the vendored `pdfjs/web/viewer.html` — with no policy at
  all. The viewer is the one that renders untrusted input: a PDF is whatever a
  user uploaded. `serves_csp()` is pure because `serve_static` needs an
  `AppHandle` no test can build. `base-uri`, `form-action` and `frame-ancestors`
  are spelled out because they do **not** fall back to `default-src` — omitted,
  they are unrestricted, and with `'unsafe-inline'` in `script-src` an injected
  `<base href>` would repoint every relative URL on the page.
- **There is no `capabilities/` directory, and that is the strongest setting,
  not a missing file.** This shell registers no `#[tauri::command]`, calls no
  `invoke_handler`, and the SPA never touches `window.__TAURI__` or
  `@tauri-apps/api` — the plugins (dialog, log, single-instance) are driven
  from Rust only. In Tauri v2 a webview reaches a command only through a
  granted capability, so no capability file means the webview can call nothing.
  Adding a `default.json` "for completeness" would hand it access it does not
  have today.
- **One header policy for every upstream-derived response: `proxy::copy_headers`.**
  Four hand-rolled ones diverged, and the divergence is where the bug above
  lived. `ETag` must survive (no ETag, no revalidation, every JSON GET refetched
  in full) and so must `Content-Length` (without it a first GLB download is
  chunked and `GLTFLoader` loses `lengthComputable`).
- **Declaring `Content-Length` is why `cache::tee_to_disk` holds back one
  chunk.** hyper stops polling a response body the instant the declared length
  is satisfied, so anything the tee did after its final `yield` never ran: the
  download completed, the `rename` did not, and the `TempFile` Drop guard
  deleted a byte-perfect blob. The promote happens before the last chunk goes
  out. Verified by removing the header and watching the blob appear.
- `/api/assets/{hash}` is cached on disk per `(upstream, user)`. The split is
  not tidiness: serving from cache skips the gateway's `RequireBlobAccess`, so
  a shared directory would leak one tenant's models to the next user.
- The blob cache is evicted **least-recently-modified**, not LRU — say it that
  way, the two are not the same thing here. A cache hit is served through
  `tower_http::services::ServeFile`, which reads the file's bytes but never
  touches its mtime, so a blob opened daily is exactly as evictable as one
  downloaded once and forgotten. `evict.rs`'s own doc comment already says
  this correctly; this is an accepted trade-off (a real LRU would need a
  side-index this crate doesn't have), not a bug to "fix" by adding one.
- **Never read the OS keychain on the startup path or the request path.**
  `session::load()` used to run before `server::spawn`, and macOS pops an
  authorization prompt whenever the reading binary's signature differs from
  the one that wrote the entry — true on every rebuild, and in production on
  every app update. The result was no server and no window at all: a dead
  process sitting behind a modal dialog nobody could see. The session now
  lives in `AppState.session: Arc<Mutex<Option<Stored>>>` as the source of
  truth for every request (`user_cache_root`, snapshot save/replay); the
  keychain is written through on login/logout and read back exactly once, in
  a `spawn_blocking` that runs off `setup()`'s critical path, so a slow or
  prompting read never blocks the server or the window from coming up.
- **Gateway-bound requests wait for that read; the startup path does not.**
  The dialog waits for a human — eight seconds in the run that found this — and
  the webview is up long before the answer. Its first call is `/api/auth/me`,
  which went out with no cookie, took a 401, and made the SPA drop its session
  marker and land on `/login` while the restore was still behind the dialog:
  the fixed port kept the marker across restarts, and this destroyed it anyway.
  `proxy::await_restore` holds `forward` and `handle_asset` on a
  `watch::Receiver<bool>` the restore closure releases on both its paths (a
  first launch with nothing stored must not stall for the whole budget), capped
  by `RESTORE_WAIT` so a dialog nobody answers degrades to the old behaviour
  instead of hanging. The window is already on screen, so the wait reads as a
  spinner, not a freeze.
- **`clear_session` deletes the keychain entry only if this process actually
  held a session.** The restore runs off the critical path, so a 401 can land
  before it does, and `proxy::clears_session` turns every 401 into a clear —
  deleting there destroys a credential this run never read and makes a slow or
  prompting keychain read a permanent logout. The decision is `clears_keychain`
  in `state.rs`, kept pure because `session::clear()` writes to the real OS
  keychain and cannot be exercised in a test.
- **A decision that needs a test goes in a pure function**: pull the branching
  out of the handler into a plain function over owned/borrowed values and have
  the handler call it. `dispatch()` (server.rs, the nonce gate),
  `asset_disposition()` (server.rs, hit/miss/passthrough), `cacheable()` and
  `snapshot_worthy()`/`clears_session()` (snapshot.rs, proxy.rs — which
  responses may be replayed offline, written, or drop the session),
  `read_session_cookie()` and `resolve_cache_root()` (state.rs) are the
  examples. Treat it as the convention, not as one-off refactors.
- **A pure predicate is not a route test, and the difference shipped a
  vulnerability.** `allowed()` was correct and unit-tested; `handle` called it
  with the wrong input. `AppState.app` is therefore `Option<AppHandle>` —
  `None` in tests, which cannot build one — and `state::test_state()` gives the
  router a real state, so the gate and the upstream→snapshot→replay round trip
  are exercised through `router().oneshot()`. Only `serve_static` reads the
  handle. Cover a security decision at both levels.
- Temp files for the blob cache are staged in a sibling `tmp/`, never inside
  `blobs/`. They used to sit next to their destination, where `evict::enforce_cap`
  saw an ordinary file and could unlink a download mid-flight — the atomic
  `rename` into `blobs/` then failed and a fully-verified, fully-downloaded
  blob was silently thrown away. `tmp/` is outside every directory eviction
  ever sweeps, and it is cleared once at startup — the only thing that ever
  reclaims a temp file orphaned by a hard kill, since a stream dropped mid-poll
  has no async destructor to clean up after itself.
- **The snapshot store refuses any path with a query.** `snapshot::key` hashes
  method + path + query and nothing sweeps `snapshots/`, so cursor-paged
  `/api/audit?limit=…&cursor=…` would mint a file per page forever. Nothing on
  the offline boot path carries a query.
- **`POST /api/auth/login` clears the stored session, whatever it answers.**
  Nothing stops a signed-in user reaching `/login`, and the user id only
  refreshes on the next `/api/auth/me` — in that window `user_cache_root()`
  still resolved to the *previous* user and a cache hit handed B one of A's
  blobs with no gateway call, defeating the per-user split entirely.
- Passkeys are unavailable in the shell (the RP origin is a loopback port).
  `isPasskeySupported()` is the single gate — do not add a second check.
- Logging is `tauri-plugin-log` at `Info` (Trace is tao's webview firehose); a
  bind failure raises a native dialog through `tauri-plugin-dialog` and exits.
  Use `show`, not `blocking_show` — `setup()` runs on the main thread and
  `blocking_show` freezes the app there.
- `make -C desktop check` runs fmt, clippy and tests. `make -C desktop build`
  additionally needs the Tauri CLI (`cargo install tauri-cli --version "^2"`,
  a separate binary from the `tauri` crate) installed locally; CI installs it
  itself via `tauri-apps/tauri-action`.

## Territory route composition

`/territories/$slug` is a TanStack Router route. Its loader primes the query
cache with **one** call — `sceneBundleQuery(slug)` — and the component reads it via
`useQuery`; the gateway aggregates territory + LOD0 artifact + placements + model
options + panoramas + documents server-side via errgroup. `toSceneViewModel(bundle)`
maps it into the viewer's props. No client-side fan-out.

Each placement's `glbUrl` is computed by joining `placement.modelSlug` against the `modelOptions[].slug → glbUrl` map (modelOptions already carries the artifact hash). `usePlacementsEditor` receives `modelOptions` and reuses the same lookup for CRUD round-trips, so no per-mutation `getArtifact` is needed.

When the artifact is missing, the route renders `ConversionPending`. If a `?jobId=…` search param is present (set by the upload form's redirect), it subscribes to `/api/jobs/{id}/events` for live SSE updates and refetches on `succeeded`. Without a jobId, it falls back to a short poll — the worker reconciler eventually queues the conversion, and the route re-renders into the viewer once the artifact lands.

`<SceneCanvas>` keeps `<Bounds fit clip observe>` wrapping only the territory GLB so auto-fit ignores placement instances. Each `<PlacementInstance>` clones its GLB scene via `SkeletonUtils.clone` (Three.js disallows the same Object3D under two parents — without the clone, only one of N instances of the same model would render). useGLTF caches by URL so duplicate-model placements share a single network fetch.

Placement transforms: position in scene units (territory's normalized space, max-axis = 2 after `converter.normalize`), rotation Euler XYZ in radians (the form converts to/from degrees for the human input), per-axis scale (default {1,1,1}). Self-placement is structurally impossible (placements FK to two different tables); the backend still rejects non-positive scale.

In-scene gizmo (drei `<TransformControls>`): clicking a placement selects it; the panel and the scene share `selectedId` lifted into `ModelViewer`. Mode is `translate`/`rotate`/`scale`, switchable via the panel toggle or `T`/`R`/`S` keys; `Esc` deselects; clicking empty space (`onPointerMissed`) deselects. The transform is applied imperatively via `useLayoutEffect` on the placement's group ref — keeping React's JSX out of the write path is what lets TransformControls mutate the object during a drag without React re-renders fighting the gizmo. On `dragging-changed → false` we read the object's current pos/rot/scale and dispatch a PUT; OrbitControls is auto-disabled while dragging via the same event. The form re-keys on `placement.updatedAt` so a successful drag refreshes the panel inputs to the new canonical values.

Draco + KTX2 setup lives in `viewer/presentation/three/gltf-loader-setup.ts`. The module-level `useGLTF.setDecoderPath("/draco/")` call wires up the self-hosted Draco decoder (in `frontend/public/draco/`, copied from `node_modules/three/examples/jsm/libs/draco/gltf/`), and the exported `extendGltfLoader(loader)` callback registers a singleton `KTX2Loader` (from `three-stdlib` for drei type-compat) pointing at `frontend/public/basis/`. Every `useGLTF` / `useGLTF.preload` call in `gltf-model.tsx`, `placement-instance.tsx`, and `model-viewer.tsx` passes `extendGltfLoader` so KTX2 textures decode correctly — drei v10 has no global `setKTX2Loader` static method. Without `extendGltfLoader`, KTX2-textured models render as solid-colour primitives. `KTX2Loader.detectSupport(renderer)` is intentionally skipped — module init runs before a renderer exists, so the transcoder falls back to RGBA8 (file-size win preserved, GPU-format VRAM win deferred).

KTX2/Basis Universal textures (`KHR_texture_basisu`) are produced by mesh-service by default (`MESH_KTX2_ENABLED=true`). The frontend MUST register a `KTX2Loader` explicitly — drei does NOT auto-register it, and a missing loader silently renders KTX2-textured models as solid colour. Setup mirrors the Draco one: copy `node_modules/three/examples/jsm/libs/basis/` into `frontend/public/basis/`, then in `model-viewer.tsx`:

```ts
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
const ktx2Loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
useGLTF.setKTX2Loader(ktx2Loader);
```

LOD generation is on by default with `MESH_LOD_RATIOS=0.5,0.25` — every conversion produces three artifacts: LOD0 (full quality, never simplified), LOD1 (~50% triangles), LOD2 (~25% triangles). Lower LODs also carry textures scaled by the same ratio (`gltfpack -ts`), so they are lighter on the wire and not merely lighter in triangles: on `dji-wp-46-cut`, LOD2 is 23% of LOD0's bytes.

**Loading is progressive, and both the territory and every placement use the same mechanism.** `useProgressiveLod(chain, targetLod)` (`viewer/application/`) shows the coarsest available level immediately and returns a `warmUrl`; `<LodWarmer>` downloads the target inside its own `<Suspense>` and calls back, at which point the hook swaps `url` to the target. `gltf-model.tsx` and `placement-instance.tsx` both do exactly this with `targetLod: 0`. The pure decision lives in `selectProgressive` (`shared/domain/lod-artifact.ts`) and is unit-tested; the hook is spec-tested with `renderHook`.

This is deliberately **not** drei's `<Detailed>`: the level on screen does not depend on camera distance. A territory is normally framed whole, so distance-based switching would leave it coarse forever, and the measure tool's raycast would hit different geometry depending on zoom.

The hook also owns the fallback ladder — a level that fails to load drops out of the chain by hash. That replaced an index-based ladder that only placements had; the territory previously had no fallback at all. A chain containing only LOD0 yields `warmUrl: null` and behaves exactly as before progressive loading existed, so un-reconverted territories are safe.

`GlbPreloader` warms only the coarsest level of each chain. Do not add LOD0 back to it: racing it into the cache alongside the coarse level puts both on the wire at once and defeats the point.

## Backend gateway endpoints used by the frontend

The gateway exposes a small REST surface defined in `backend/services/gateway-service/api/openapi.yaml`. The frontend talks to it through `openapi-typescript` generated DTOs.

- `GET /api/territories` — list every territory.
- `GET /api/territories/{slug}/scene` — single-shot bundle (territory + LOD0 artifact + placements + model options). Use this instead of four parallel calls.
- `POST /api/territories` — create a territory from `{slug, title, description, sourceBlobHash}`. Response is `{territory, job}`; redirect to `/territories/{slug}?jobId={job.id}` so the conversion-pending screen can subscribe to SSE.
- `GET /api/models` / `POST /api/models` / `GET /api/models/{slug}/artifacts` — same shape as territory, model side.
- `POST /api/uploads` → `PATCH /api/uploads/{id}` (raw bytes + `Upload-Offset` header) → `POST /api/uploads/{id}/finalize` — chunked upload protocol. `useChunkedUpload` slices files into 8 MB chunks and drives the loop; the resulting `blobHash` feeds into create-territory / create-model. Resumable: `HEAD /api/uploads/{id}` reports the current offset so a re-attempted client can pick up where it left off.
- `GET /api/audit` — the **company's** change journal, cursor-paged over descending `id` (`nextCursor` in the body, `X-Next-Cursor` on the response). Filters: `actor`, `action`, `entity`, `from`, `to`, `limit` (default 50, capped at 200). Behind `audit:read` alone; Root passes via the owner bypass. **The company scope comes from the session and is not a parameter** — there is no way to ask for another company's history.
- `GET /api/audit/mine` — the caller's **own** actions, behind `audit:read_own` or `audit:read`. It declares no `actor` parameter, so there is nothing to merge and nothing to forget to overwrite: the actor comes from the session and no query string can widen it. Root is pinned to its own actions here too. `/account` reads this route and only this route; `/admin/audit` reads `/api/audit`. Keeping them separate is the boundary — when both grants opened one route and the scope resolver preferred the wider one, a Company Owner (who holds both) saw the whole company under a "My activity" heading.
- `GET /api/audit.csv` — the same query streamed as CSV. Stays behind `audit:read` alone: it is the whole company's history in one file, which is not what `audit:read_own` opens. Lives on the root router, outside the ETag/compression chain, because ETag hashes the whole body and would buffer the export. The client fetches and blobs it rather than using a plain `<a download>` — not for auth reasons any more (the session cookie rides on a same-origin link too) but because it wants a filename and an error it can surface, and an `<a>` gives neither.
- `GET /api/jobs/{id}/events` — Server-Sent Events for one conversion job. Emits `event: job` whenever the job state changes; closes on `succeeded`/`failed`. Job payload carries `kind` and `slug` so the client knows which entity is being converted.
- **Every route under `/api/territories/{slug}` is gated by `RequireTerritoryAccess`**, a middleware keyed on the route-pattern prefix. A new child resource inherits the gate the moment it is registered — do not add a per-handler scope check instead, that is the shape that failed. It answers 404, never 403: a 403 confirms the territory exists, and to another tenant it must not.
- `GET /api/assets/{hash}` **requires a session and is scoped to the tenant**: `RequireBlobAccess` asks the catalog whether any row this caller can see holds that hash. A blob hash addresses content and is deduplicated across territories and models, so it has no single territory and `RequireTerritoryAccess` cannot cover it. Model blobs pass for everyone — the library is shared by decision. Refusal is 404 (403 would confirm the blob exists); a catalog failure is 503, because that is neither "yours" nor "missing".
- **Added a table with a hash column?** Add a branch to `ResolveBlobAccess` and a case to its integration test, or the new asset type is reachable by nobody or by everybody, and nothing else will notice.
- `GET /api/jobs/{id}/events` **requires a session** but is deliberately not tenant-scoped: a job id is 128 random bits and the payload names a kind and a slug, not a blob.
- **Mutations on a cookie session require `X-CSRF-Token`** (`HMAC(GATEWAY_CSRF_SECRET, sessionToken)`, handed out at login and in `/api/auth/me`). Bearer callers are exempt by construction — a browser cannot attach an `Authorization` header cross-site — so curl, the tests and integrations are unaffected.
- **CORS is off by default.** An empty `GATEWAY_ALLOWED_ORIGINS` means the handler is not mounted at all. Do not "disable" it by blanking the list in code: go-chi/cors reads an empty list as *all* origins.
- All JSON GETs carry strong ETags and answer `If-None-Match` with 304. Browsers cache automatically — no client-side work required.
- All JSON responses are Brotli/gzip-compressed when the client advertises `Accept-Encoding: br, gzip`.

Measure tool (`MeasurementLayer` + `MeasureButton`): toggled by the toolbar button or `M` key. Two clicks on any visible surface (parent GLB or a placement) form one measurement — drei `<Line>` between the points, sphere markers at both ends, and a midpoint `<Html>` label with the distance. While `measureMode` is on the gizmo unmounts and `PlacementInstance` skips its own `stopPropagation` so the click bubbles up to the wrapper-group's `onClick` handler that captures `event.point`. The label converts scene units to source units by `unitRatio = max(metadata.dimensions) / 2` (the converter normalises every mesh to max-axis = 2); when bbox metadata is missing we fall back to raw scene units suffixed `u`. `Esc` exits measure mode, `Clear` wipes finished measurements.
