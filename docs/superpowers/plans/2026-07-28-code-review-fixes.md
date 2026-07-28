# Code review fixes — 2026-07-28

Branch `spa`, 19 commits today (`a0bda4e`..`e30f95e`), nothing pushed. All gates green:
frontend `yarn lint` (now typechecks) / `build` / `test` 152 / `test:spa` 218,
backend `go test -race -shuffle=on ./services/gateway-service/...`.

## Bugs found and fixed

Five real defects, each with a test that fails without the fix.

| # | Where | Defect |
| --- | --- | --- |
| 1 | `auth/infrastructure/passkey-gateway.ts` | Passkey sign-in discarded the session token |
| 2 | `conversion/application/use-conversion-watcher.ts` | Model conversion screen never left the pending state |
| 3 | `gateway/internal/bootstrap/transport.go` | CORS blocked every chunked upload |
| 4 | `measurement/application/measurement-reducer.ts` | Chain id reissued to a chain still on screen |
| 5 | `upload/domain/batch-row.ts` | `.zip` kept in the title when the filename had trailing space |

### 1. Passkey login never stored the token (`3034cec`)

The gateway answers `passkey/login/finish` with `{"token": …}`
(`transport/authhttp/passkey.go:32`), but `loginFinish` was typed
`Promise<void>` and dropped the body. The deleted Next.js BFF route used to
turn it into an httpOnly cookie; the SPA has nothing that does. A successful
ceremony redirected to `?next=`, the guard found no token in localStorage and
bounced back to `/login` — a working passkey looked like a rejected one.

Introduced earlier the same day in `4d722bb`, which restored the passkey button
lost during the SPA migration.

### 2. Wrong query key on model conversion (`f4aa5d1`)

Both routes render the same pending screen, but the watcher always invalidated
`["scene", slug]`. `/models/$slug` is backed by `["model", slug]` and
`["model-artifacts", slug]`, so the invalidation matched nothing: SSE reported
`succeeded` and the user sat on "Done, refreshing the page…" until a manual
reload. The no-jobId polling branch was equally inert. The watcher now takes the
`JobKind` it already models; both callers pass it, so a third screen that
forgets cannot compile.

### 3. CORS blocked chunked uploads (`4681aa1`)

Three gaps in one config, all dormant until the SPA went cross-origin — which
includes local dev, where `:3000` and `:8080` are different origins:

- `Upload-Offset` (a required header on `PATCH` per the OpenAPI spec) was not in
  `AllowedHeaders`, so the preflight failed and the browser dropped every chunk.
- `HEAD` was not in `AllowedMethods`; carrying a Bearer token makes it
  preflighted rather than simple, so resume was blocked too.
- `Upload-Offset` / `Upload-Length` were not in `ExposedHeaders`, so
  `getUploadStatus` would have read 0 for both.

Verified against the running gateway: both preflights echo the header and
method, an unlisted header still gets nothing back.

### 4. Chain id collision (`1d83837`)

On `removeSegment` the reducer advanced `nextId` by the number of chains
`removeSegment` returned. But a split that drops its left side still labels the
survivor with the *second* of the two ids it was handed, so the counter
reissued an id belonging to a chain still on screen: the next click extended two
chains at once and Remove deleted both. Both ids are retired now.

### 5. `deriveTitle` ordering (`b860221`)

Replaced the `.zip` suffix before trimming, so a filename with trailing
whitespace kept its extension in the title.

## Structural fixes

- **Typecheck was dead repo-wide** (`d047b97`). `declare module { interface
  RouterContext }` in `router.tsx` was a no-op — TanStack has no such
  augmentation point — so `rootRoute` had context `{}` and every loader reading
  `context.queryClient` was a type error: 51 in total. `createRootRouteWithContext`
  fixes it. Neither `yarn lint` nor `yarn build` ran `tsc`, which is why none of
  it was visible; `lint` now runs `tsc --noEmit` first, with a `typecheck`
  script for running it alone.
- **`?next=` lost the query string** (`e30f95e`). `requireAuth` took a pathname,
  so deep-linking to `/territories/x?jobId=y` logged in and landed without the
  jobId. Both guards take the location now; a bare path no longer typechecks.
- **Console permission redirects** (`e30f95e`). `/admin/users` and
  `/admin/roles` had no permission checks of their own — they leaned on the
  layout's OR gate — and four denials hardcoded a redirect to `/admin/users`, so
  a roles-only user went from one forbidden page to another. Both pages guard
  themselves; `consoleLanding(me)` picks a reachable destination.
- **Unbounded Prometheus read** (`e30f95e`). Capped at 8 MB via
  `io.LimitReader`, reading one byte past the cap so a truncated response fails
  loudly instead of reaching the JSON parser as a valid-looking prefix. Client
  timeout added as a backstop.
- **`<a href>` → `<Link>`** (`e30f95e`) on four in-app "+ Upload" affordances.

## Test coverage

100 → 370 tests (node:test 72 → 152, vitest 28 → 218).

- **Domain** — magic-byte sniffs, transforms, LOD ordering, bbox, job state,
  panorama calibration, WGS84→UTM→scene projection, EXIF GPS, panel catalogue,
  tour steps. The EXIF suite builds real JPEG bytes (SOI, APP1 `Exif\0\0`, TIFF
  header, GPS IFD with out-of-line RATIONALs) and runs both byte orders.
- **Application** — measurement reducer, translate-mode surface contract, toast
  store, chunked-upload runner, EXIF→scene anchor.
- **Infrastructure** — territory / placement / model / passkey gateways and the
  http error helpers, against a mocked client.
- **Hooks** — keyboard shortcuts, chunked upload, SSE job stream, measurement
  tool, onboarding tour, conversion watcher.

Two runners, non-overlapping globs: `node --test` for `*.test.ts` (pure domain,
no path aliases), vitest for `*.spec.ts[x]`. Anything importing through `@/`
must be vitest — `node --test` has no alias map, which is why the application
layer had almost no coverage before.

`src/test-support/render-hook.tsx` is a 15-line harness on React 19's own `act`
plus `react-dom/client`, chosen over adding `@testing-library/react`. Marked
`ponytail:` — swap in the real library if queries, events or cleanup semantics
are ever needed.

## Dead code removed

Post-migration leftovers, none of them imported:

- `metrics/infrastructure/` entirely — `prometheus-gateway.ts` read
  `process.env.PROMETHEUS_URL` and fetched `http://prometheus:9090` directly, a
  path unreachable from a browser. The dashboard goes through the gateway's
  owner-gated `/api/metrics/query`.
- `metrics/domain/panels.ts` — the PromQL table, contradicting its own sibling's
  contract that `expr` lives only in the Go registry.
- `auth/application/current-user.ts` — imported `server-only`, a package absent
  from both `package.json` and `node_modules`.
- Orphaned after the above: `RANGE_SECONDS`, `stepSeconds`, `PanelDef`.
- The `frontend` service in `docker-compose.yml`, which built from a Dockerfile
  deleted in the cutover — a plain `docker compose up` failed at build.

## Open items

Not addressed, listed in descending order of consequence.

1. **`make lint` is red on the backend** — 12 issues, all pre-existing
   (confirmed by stashing today's edits and re-running): errcheck ×8 on
   unchecked `Close()` in `serve.go` / `query.go`, revive ×2 for `FlowId` →
   `FlowID`, unused `errArtifactMissing` in `territories.go`, and the staticcheck
   entry below.
2. **`middleware.RealIP` is deprecated as IP-spoofable** — it overwrites
   `r.RemoteAddr` with the leftmost `X-Forwarded-For` value whether or not the
   infrastructure sets it, so a client can forge the IP in logs and metrics.
   Removing it means logging the proxy's IP instead; the right call depends on
   whether nginx on prod strips the incoming header. Needs a decision.
3. **13 hooks and 112 `presentation/` files remain untested** — the panorama
   hooks and `use-placements-editor` (229 lines) need a `QueryClientProvider` in
   the harness and R3F mocks.
4. **TypeScript held at 6.0.3** — typescript-eslint 8.65 caps the peer at
   `<6.1.0`. Revisit when a stable release supports TS 7.

## Gotchas worth remembering

- `mockRejectedValue` builds the rejected promise up front, so the runner flags
  it as unhandled before the code under test can attach `.catch` — assert that
  `.catch` was called via a thenable instead.
- Run the frontend on port **3000**, not Vite's default 5173:
  `PASSKEY_RP_ORIGINS` is pinned to `http://localhost:3000` and WebAuthn
  compares origins byte-for-byte, so passkey login on 5173 fails with an origin
  error that reads like a code bug.
