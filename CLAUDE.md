# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before committing Go changes

Run `make -C backend check` — gofmt, `go mod tidy` drift, `GOWORK=off go vet`,
golangci-lint, `go test -race -shuffle=on`, govulncheck. ~80 s. `.githooks/pre-commit`
runs it for you once `make -C backend hooks` has been run in the clone, and
`.github/workflows/backend.yml` runs the same target on every PR. Rationale for
the two non-obvious steps (`vet` and `tidy-check` both run with the workspace off, and
catch Docker-build failures that `make lint` cannot see): [`backend/CLAUDE.md`](backend/CLAUDE.md#the-commit-gate).

## CI

Four workflows, and until 2026-09-01 there was one. `backend.yml` runs
`make -C backend check`; `frontend.yml` runs lint, `test:coverage` (vitest
with its 90/85/90/90 thresholds, in place of a plain test run), the build and
a production-dependency audit; `desktop.yml` runs `make -C desktop check`,
`cargo audit` and the three-platform bundle; `dependabot.yml` watches gomod,
npm, cargo **and github-actions**. Each workflow invokes the same Makefile or
yarn script a developer runs, never a reimplementation of it in YAML — the
failure that shape produces is a green PR that a local commit would reject.

## Frontend (`frontend/`)

One SPA: Vite 8 + React 19 + TypeScript 7, Tailwind 4, TanStack Router and
Query, laid out Feature-Sliced (`app → pages → widgets → features → entities
→ shared`) and built against the Claude Design project
`Design System.dc.html`. It is Home, the catalog, the account pages, the
admin console and the territory viewer (three.js, panoramas, PDFs), all
wired against the real gateway. It was `frontend-v2/` — the redesign — until
2026-09-17, when the previous app was deleted (commit `3d5ce2d2`) and this one
took over its directory; that app's Clean-Architecture/DDD layout, its
`src/routes/` tree and its rules are gone with it. It is served by nginx in
production and embedded by the desktop shell. `yarn dev` runs it on port
**3000**, the origin `PASSKEY_RP_ORIGINS` lists.

**Working in it? Read [`frontend/CLAUDE.md`](frontend/CLAUDE.md) first**: it
records the design decisions, the user's working rules, the production shell
(single origin, `VITE_API_URL` empty, the PWA files in `public/`), and the
tooling traps — chief among them that `tsc --noEmit` type-checks nothing there,
and that a parallel session works in `backend/` so commits must be staged by
path.

## Desktop shell (`desktop/`)

Tauri v2 wrapper around the SPA in `frontend/`. A loopback axum server inside the Rust
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
  `isPasskeySupported()` (`frontend/src/entities/passkey`) is the single gate —
  it reads the `window.__DESKTOP__` flag `main.rs` injects; do not add a
  second check.
- Logging is `tauri-plugin-log` at `Info` (Trace is tao's webview firehose); a
  bind failure raises a native dialog through `tauri-plugin-dialog` and exits.
  Use `show`, not `blocking_show` — `setup()` runs on the main thread and
  `blocking_show` freezes the app there.
- `make -C desktop check` runs fmt, clippy and tests. `make -C desktop build`
  additionally needs the Tauri CLI (`cargo install tauri-cli --version "^2"`,
  a separate binary from the `tauri` crate) installed locally; CI installs it
  itself via `tauri-apps/tauri-action`.


## Backend gateway endpoints used by the frontend

The gateway exposes a small REST surface defined in `backend/services/gateway-service/api/openapi.yaml`. The frontend talks to it through `openapi-typescript` generated DTOs.

- `GET /api/territories` — list every territory. Both this and the single `GET /api/territories/{slug}` carry `placementCount`, omitted when it's zero. The two list endpoints (`GET /api/territories`, `GET /api/models`) also carry `lods` (every LOD, sorted, `[]` before the first conversion), read in one catalog query for the whole page; the single GETs do not.
- `GET /api/territories/{slug}/scene` — single-shot bundle (territory + LOD0 artifact + placements + model options + saved measurements). Use this instead of four parallel calls. `measurements` is required and `[]` when the territory has none.
- `GET /api/territories/{slug}/measurements`, `POST …/measurements` (`{points: Vec3[], closed}` → 201 `Measurement`), `PUT …/measurements/{id}` (same body, replaces the chain), `DELETE …/measurements/{id}` (204) and `DELETE …/measurements` (every measurement on the territory → `{deleted: n}`) — saved ruler chains, shared by everyone who can open the territory. The GET needs only the session; POST needs `measurement:create`, PUT `measurement:write`, both DELETEs `measurement:delete`. A point is `{x, y, z}` in the territory's normalised scene space; a chain has 2–1000 points, a closed one at least 3, anything else is 400. An id of another territory answers 404, like an unknown one.
- `GET /api/territory-admins` — `{slug: userId[]}` for every visible territory (`[]` when unassigned), Root only like `…/{slug}/admins`. Outside `/api/territories/{slug}` on purpose (chi would shadow a territory called `admins`), so `RequireTerritoryAccess` does not cover it: the handler gates on Root and reads the set through the caller's scope.
- `POST /api/territories` — create a territory from `{slug, title, description, sourceBlobHash}`. Response is `{territory, job}`; redirect to `/territories/{slug}?jobId={job.id}` so the conversion-pending screen can subscribe to SSE.
- `GET /api/models` / `POST /api/models` / `GET /api/models/{slug}/artifacts` — same shape as territory, model side. `GET /api/models` and the single `GET /api/models/{slug}` both carry `usageCount` (distinct territories placing the model), omitted when it's zero.
- `POST /api/uploads` → `PATCH /api/uploads/{id}` (raw bytes + `Upload-Offset` header) → `POST /api/uploads/{id}/finalize` — chunked upload protocol. `runChunkedUpload` (`entities/upload`) slices files into 8 MB chunks and drives the loop; the resulting `blobHash` feeds into create-territory / create-model. Resumable: `HEAD /api/uploads/{id}` reports the current offset so a re-attempted client can pick up where it left off.
- `GET /api/auth/2fa` — the caller's own 2FA posture: whether it's on, when it went on, and how many recovery codes remain. `enabledAt` is **omitted**, never guessed, when the enrolment predates the column or 2FA is off. Disabling 2FA and regenerating recovery codes (`POST /api/auth/2fa/disable` / `.../recovery/regenerate`) both take a **current TOTP code** — not a recovery code, and not the password; an earlier mock said "password" and it cost a design round to correct.
- `GET /api/audit` — the **company's** change journal, cursor-paged over descending `id` (`nextCursor` in the body, and only there — no response header carries it). Filters: `actor`, `action`, `entity`, `from`, `to`, `limit` (default 50, capped at 200). Behind `audit:read` alone; Root passes via the owner bypass. **The company scope comes from the session and is not a parameter** — there is no way to ask for another company's history.
- `GET /api/audit/mine` — the caller's **own** actions, behind `audit:read_own` or `audit:read`. It declares no `actor` parameter, so there is nothing to merge and nothing to forget to overwrite: the actor comes from the session and no query string can widen it. Root is pinned to its own actions here too. `/account` reads this route and only this route; `/console/audit` reads `/api/audit`. Keeping them separate is the boundary — when both grants opened one route and the scope resolver preferred the wider one, a Company Owner (who holds both) saw the whole company under a "My activity" heading. It also carries `total` — how many rows the same filters match, paging aside — because the account page pages by number; `GET /api/audit` does not (`include_total` is set only by the `/mine` handler), it is polled and would pay for the count on every tick.
- `GET /api/audit.csv` — the same query streamed as CSV. Stays behind `audit:read` alone: it is the whole company's history in one file, which is not what `audit:read_own` opens. Lives on the root router, outside the ETag/compression chain, because ETag hashes the whole body and would buffer the export. The client fetches and blobs it rather than using a plain `<a download>` — not for auth reasons any more (the session cookie rides on a same-origin link too) but because it wants a filename and an error it can surface, and an `<a>` gives neither.
- `GET /api/jobs/{id}/events` — Server-Sent Events for one conversion job. Emits `event: job` whenever the job state changes; closes on `succeeded`/`failed`. Job payload carries `kind` and `slug` so the client knows which entity is being converted. An unknown or foreign id answers one `event: error` frame and closes; the SPA treats it as "use the poll".
- `GET /api/jobs` — the latest conversion job per territory/model, succeeded ones excluded, territories filtered to the caller's visible set. `Cache-Control: no-store`; the SPA polls it every 5 s while anything is running. Each row is the latest job by write order — two concurrent submits for one target are not serialised, so a superseded terminal state can briefly show while a newer job runs. The per-id SSE applies the same rule: a territory job the caller cannot see is "job not found".
- `GET /api/metrics/query?panel=a&panel=b&range=1h` — owner only; `{panel: MetricSeries[]}`, four Prometheus queries at a time. Every id is validated before the first query, a failed panel is absent from the map, 502 only when all failed.
- **Every route under `/api/territories/{slug}` is gated by `RequireTerritoryAccess`**, a middleware keyed on the route-pattern prefix. A new child resource inherits the gate the moment it is registered — do not add a per-handler scope check instead, that is the shape that failed. It answers 404, never 403: a 403 confirms the territory exists, and to another tenant it must not.
- `GET /api/assets/{hash}` **requires a session and is scoped to the tenant**: `RequireBlobAccess` asks the catalog whether any row this caller can see holds that hash. A blob hash addresses content and is deduplicated across territories and models, so it has no single territory and `RequireTerritoryAccess` cannot cover it. Model blobs pass for everyone — the library is shared by decision. Refusal is 404 (403 would confirm the blob exists); a catalog failure is 503, because that is neither "yours" nor "missing".
- **Added a table with a hash column?** Add a branch to `ResolveBlobAccess` and a case to its integration test, or the new asset type is reachable by nobody or by everybody, and nothing else will notice.
- `GET /api/jobs/{id}/events` **requires a session and is now tenant-scoped**: `Server.scopedJob` resolves the job, and a territory job the caller cannot see is refused as `job not found` — the same 404-shaped answer the territory routes give, never a 403 that would confirm the territory exists. Models and Root skip the catalog lookup. A job id is still 128 random bits; the scope check is the second lock, not the only one.
- **Mutations on a cookie session require `X-CSRF-Token`** (`HMAC(GATEWAY_CSRF_SECRET, sessionToken)`, handed out at login and in `/api/auth/me`). Bearer callers are exempt by construction — a browser cannot attach an `Authorization` header cross-site — so curl, the tests and integrations are unaffected.
- **CORS is off by default.** An empty `GATEWAY_ALLOWED_ORIGINS` means the handler is not mounted at all. Do not "disable" it by blanking the list in code: go-chi/cors reads an empty list as *all* origins.
- All JSON GETs carry strong ETags and answer `If-None-Match` with 304. Browsers cache automatically — no client-side work required.
- All JSON responses are Brotli/gzip-compressed when the client advertises `Accept-Encoding: br, gzip`.

