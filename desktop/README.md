# Andrey Desktop

Tauri v2 shell around the existing SPA. A loopback HTTP server inside the Rust
process serves the embedded `frontend/dist` and proxies `/api` to the gateway,
which reproduces production's nginx topology — that is what lets the
single-origin frontend run unchanged.

Design: [`docs/superpowers/specs/2026-08-04-tauri-desktop-design.md`](../docs/superpowers/specs/2026-08-04-tauri-desktop-design.md)

## Prerequisites

- Rust via [rustup](https://rustup.rs), plus the platform packages listed in
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
  (on Debian/Ubuntu: `libwebkit2gtk-4.1-dev libappindicator3-dev
  librsvg2-dev patchelf`).
- The Tauri CLI, which is **not** part of the `tauri` crate — it is a
  separate binary that `cargo tauri build` shells out to:
  `cargo install tauri-cli --version "^2"`. CI installs it automatically
  (`tauri-apps/tauri-action` does this itself); locally it is a one-time
  manual step.

## Commands

```bash
make check                                  # fmt + clippy + test
make build                                  # bundle for the current OS (needs the Tauri CLI above)
cd src-tauri && cargo run                   # run against production
DESKTOP_UPSTREAM=http://localhost:8080 cargo run   # run against a local backend
```

`make check` needs `frontend/dist` to exist before it runs: `tauri::generate_context!()`
embeds `frontendDist` at Rust compile time, so `cargo fmt`/`clippy`/`test` all
fail to even compile without it. `check` fails fast with the fix
(`yarn --cwd ../frontend build`) rather than building the frontend itself —
that would make a fast gate slow every time it runs.

The frontend is still developed with `yarn dev` in a browser. `cargo run`
serves a built `dist`, so rebuild the frontend after changing it.

### Running against a local backend

`make -C backend compose-up` passes `--build` to `docker compose`, which on a
machine that cannot reach Docker Hub fails trying to pull the
`golang:1.26.5-alpine` base rather than reusing what is already built. If the
images are already built (from an earlier successful compose-up, or built
elsewhere), start from them directly and skip the rebuild:

```bash
docker compose -f docker-compose.yml up -d --no-build
```

Then point the shell at it with `DESKTOP_UPSTREAM=http://localhost:8080`.

## Icons are placeholders

`src-tauri/icons/icon.png` was derived from `frontend/public/apple-icon.png`
with `sips` — it is a single square PNG, not a real icon set. The
per-platform files `cargo tauri build` normally expects (`icon.icns` for
macOS, `icon.ico` for Windows) were never generated, so a release build will
either fall back to a low-quality auto-conversion of `icon.png` or fail
depending on platform — do not treat a build produced today as
release-ready on icon grounds alone.

## Manual checklist per OS

None of these can be covered by `cargo test`. Run all of them on macOS, Linux
and Windows before tagging a release. Nothing in this section has actually
been observed by anyone during this work — the checklist exists because the
things it names were never looked at, not because they were checked and
passed.

- [ ] A territory renders and orbits smoothly. **On Linux this is the main
      risk**: WebKitGTK falls back to software rendering on some drivers and a
      large scene crawls. Known workaround: `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- [ ] A Draco + KTX2 model shows textures. A flat-coloured model means the CSP
      blocked the decoder — the failure is silent, not an error.
- [ ] A PDF document opens and scrolls (pdf.js loads it by byte range).
- [ ] Uploading a model shows live conversion progress via SSE. **This has
      never actually been observed**: the response shape was confirmed to be
      `chunked` with no `Content-Length` (so the transport is capable of
      streaming multiple frames), but every conversion job run against the
      local fixture during this work failed in single-digit milliseconds —
      too fast for a second SSE frame to ever be seen arriving before the
      stream closed. Someone has to watch a real, slower conversion run to
      confirm frames actually land progressively rather than all at once at
      the end.
- [ ] Reopening a territory issues no network requests for the GLB.
- [ ] With the network off, a previously opened territory still opens.
- [ ] Signing in as a second user does not serve the first user's models.
- [ ] Everything visual — scene rendering, textures, PDF display, the
      in-scene translate/rotate/scale gizmo — has never been seen by any
      agent that worked on this shell; none of them could open a window.
      This is not a "probably fine" item, it is a genuinely unverified one.
