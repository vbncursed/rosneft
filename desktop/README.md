# Andrey Desktop

Tauri v2 shell around the SPA in `frontend/` (the Feature-Sliced app that was
`frontend-v2/` until it replaced the old one on 2026-09-17). A loopback HTTP
server inside the Rust process serves the embedded `frontend/dist` and proxies
`/api` to the gateway,
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
DESKTOP_PORT=17818 cargo run                       # run beside an installed copy
```

The loopback server binds a **fixed** port (`17817`). That is not cosmetic: the
webview's origin is built from it, `localStorage` is partitioned by origin, and
the SPA keeps its session marker there — an ephemeral port means an empty store
and a login prompt on every launch. `DESKTOP_PORT` overrides it so a dev build
can run beside an installed copy instead of fighting it for the origin — and it
also turns off the single-instance guard, which locks on the bundle identifier
alone and would otherwise stop the dev build as a duplicate of the installed
one.

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
`golang:1.27.1-alpine` base rather than reusing what is already built. If the
images are already built (from an earlier successful compose-up, or built
elsewhere), start from them directly and skip the rebuild:

```bash
docker compose -f docker-compose.yml up -d --no-build
```

Then point the shell at it with `DESKTOP_UPSTREAM=http://localhost:8080`.

### The macOS keychain prompt comes back after every rebuild

On macOS the app asks for keychain authorisation on each `cargo run` following a
`cargo build`, and clicking **Always Allow** does not stop it. That is the
system working as designed: the keychain ACL authorises the *binary that asked*,
identified by its signature, and every rebuild produces a different binary that
was never on the list. Development recompiles constantly, so the entry is
perpetually asked for by a stranger. A released, signed build has a stable
identity and is authorised once.

This is the visible half of a bug that is already fixed, and the difference
matters. `session::load()` used to run in `setup()` before `server::spawn`, so
the prompt blocked startup: no server, no window, a process sitting behind a
modal nobody could see. The read now happens in a `spawn_blocking` off the
critical path — the window opens and the app works while the prompt is up, and a
request that arrives first simply has no session and gets bounced to `/login`.
So the prompt is noise now, not a hang.

If it is intolerable in a tight dev loop, delete the entry and there is nothing
left to authorise:

```bash
security delete-generic-password -s fun.vbncursed.andrey.desktop
```

The cost is signing in again on the next launch, and it has to be repeated each
time a login writes the entry back. It is a convenience for whoever is
recompiling; a user never needs it, and there is no flag or environment variable
to turn the keychain off — the session has one storage mechanism.

## Cloudflare must not challenge `/api`

Production sits behind Cloudflare, and **Bot Fight Mode breaks this app
completely**: every `/api` request answers `403` with `cf-mitigated: challenge`
and a `Just a moment...` page, so the SPA reports *"You don't have permission
to do this"* — `client.ts`'s text for a 403 — before a single request reaches
the gateway.

The reason is structural, not a misconfiguration. The proxy calls the gateway
from Rust via `reqwest`: its own cookie jar, no JavaScript engine, so it cannot
solve a challenge, ever. A browser passes once and carries `cf_clearance`
afterwards, which is why the site works there while the desktop client does
not — and why this is invisible against `localhost:8080`, where there is no
Cloudflare at all.

**Bot Fight Mode (the free one) cannot be skipped by a WAF custom rule.** It
runs before custom rules, and the skip list only offers *Super* Bot Fight Mode,
a paid feature. Turn it off under Security → Bots. Check Security Level too —
"I'm Under Attack" challenges everything on its own.

A custom rule skipping `Browser Integrity Check` for `starts_with(uri.path,
"/api/")` is worth keeping alongside: that check also rejects clients without
browser-shaped headers. It is not a substitute for turning Bot Fight Mode off.

Nothing is lost by exempting `/api`: authentication there is the session cookie
plus CSRF plus RBAC, none of which a challenge contributes to. The SPA and its
assets are served from inside the binary, so no Cloudflare setting affects them.

## Getting a build, and opening it once you have

**Released builds** live under [Releases](https://github.com/vbncursed/rosneft/releases),
published by pushing a `desktop-v*` tag:

```bash
git tag desktop-v0.2.0 && git push origin desktop-v0.2.0
```

**Bump `version` in `src-tauri/tauri.conf.json` first** (and `Cargo.toml`, which
is kept in step with it). The tag must be `desktop-v<that version>`: the release
job checks the two agree and fails before building if they do not, because the
bundler stamps the config's version into every installer name — a release titled
v0.2.0 full of files called 0.1.0 is the failure this prevents.

The release is titled `Andrey Desktop v0.2.0` — the workflow builds the title
from the version, not from the tag, which is why it no longer reads
"Andrey Desktop desktop-v0.2.0". Installers are renamed out of the bundler's
own scheme before they are published:

```
Andrey-0.2.0-macos-arm64.dmg
Andrey-0.2.0-linux-x86_64.AppImage
Andrey-0.2.0-windows-x64-setup.exe
```

The arch label follows each platform's own vocabulary rather than one spelling
for all three — somebody matching a download against their machine reads the
word their OS uses. The run's Artifacts carry the same names.

**Every other run** — pull requests touching `desktop/` or `frontend/`, and
manual runs from the Actions tab — builds the same installers but publishes
nothing: they land in the run's **Artifacts** section and expire after 14
days. The publish step is gated on `refs/tags/`, and `tauri-action` is given no
`tagName` at all, so a pull request cannot publish a release even if it edits
this workflow.

`.dmg` for macOS, `.AppImage` for Linux, `.exe` (NSIS) for Windows.

**Nothing here is signed**, and every platform will object. That is expected,
not a broken build — but it does mean an installer cannot simply be handed to
someone outside the team.

- **macOS** refuses hardest. A download carries a quarantine attribute, and
  for an unsigned bundle recent macOS reports it as *"damaged and can't be
  opened"* rather than anything about signing — the message is misleading, the
  file is fine. Clear the attribute after copying the app out of the `.dmg`:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Andrey.app
  ```

- **Windows** shows a SmartScreen warning: *More info → Run anyway*.
- **Linux** needs the `.AppImage` marked executable (`chmod +x`). On some
  drivers WebKitGTK falls back to software rendering and a large scene will
  crawl — `WEBKIT_DISABLE_DMABUF_RENDERER=1` is the known workaround.

Signing, notarization and auto-update are all out of scope for this iteration.
Until they exist, treat a downloaded build as a smoke test.

## Icons: icon 2e, a complete set

Every file in `src-tauri/icons/` is icon 2e from `Site Icon.dc.html`,
generated by `frontend/icons/render.py` together with the web app's icons.
The script renders the mock's SVG symbols (kept verbatim in `frontend/icons/`)
through Chromium, so edit a source and rerun it; never edit an output:

```bash
python3 frontend/icons/render.py   # Playwright (Chromium), Pillow, macOS iconutil
```

The set is complete and load-bearing: `icon.ico` is **required** on
Windows, where `tauri-build` generates a resource file from it and fails the
build outright without one — `icons/icon.ico not found`, after a full release
compile. A single `icon.png` is enough for macOS and Linux, which is why this
only surfaced on the Windows runner.

**The shapes differ per platform on purpose.**

- **macOS** — `icon.icns` is masked to a superellipse and inset to Apple's
  grid: 824px of artwork on a 1024px canvas, transparent margins included.
  macOS does not apply that mask for you: ship a full-bleed square and the app
  sits visibly larger than every neighbour in the Dock.
- **Windows** — `icon.ico` has rounded, transparent corners at the mock's
  taskbar ratio, 4px on a 24px tile. Windows draws the file as it is, and the
  mock draws the taskbar tile rounded. Each size is its own frame: the 16 is
  the mock's small cut (solid ground, no grid lines), which a downscale of the
  256 would turn into mush.
- **Linux** — `icon.png` and the sized PNGs stay full-bleed squares with
  opaque corners; they are also the window icon. Do not round them to match
  the other two.

`cargo tauri icon` would regenerate the set from one PNG, but it cannot do
the per-platform shapes or the 16px cut, so do not use it here.

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
      **Re-check this after the CSP change**: `viewer.html` now receives the
      policy, where before only `index.html` did, and an iframe does not
      inherit its parent's. Its needs were read off the vendored file — no
      inline scripts, one `<style>` block covered by `style-src
      'unsafe-inline'`, worker covered by `worker-src 'self' blob:` — but
      read is not run, and a CSP violation here is a blank iframe with only a
      console message, the same silent shape as the KTX2 failure below.
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
- [ ] **The session survives a restart on Linux.** keyring 4 replaced the
      blocking `dbus-secret-service` backend with pure-Rust `zbus`
      (`sync-secret-service` → the `v1` feature's
      `zbus-secret-service-keyring-store`). The store/load/clear round trip was
      confirmed by hand against the real macOS keychain on the upgrade; the
      Secret Service path was not, and an AppImage is exactly where a dbus
      stack change shows up. A failure here is silent in the worst way — the
      app just asks for a login every start, which `session::load` swallows on
      purpose so a box with no Secret Service still runs.
- [x] **A territory renders, on macOS.** Confirmed by hand on 2026-08-05
      against a local backend: `dji-wp-46-cut` renders, and its placements
      render with it. Everything else visual — textures on other models, PDF
      display, the in-scene translate/rotate/scale gizmo — is still unseen,
      and none of it has been looked at on Linux or Windows at all.

      Getting that far took a CSP fix that no test could have produced, and
      the shape of the failure is the reason this checklist exists: the
      KTX2/Basis transcoder is Emscripten output whose embind layer builds
      bindings with `new Function`, which `'wasm-unsafe-eval'` does not
      permit. It threw as an unhandled promise rejection, so
      `useProgressiveLod` never saw a load failure, never dropped the level,
      and left the coarsest LOD on screen — an empty dark scene, nothing in
      the console but the rejection. 68 Rust tests, two whole-branch reviews
      and a live `curl` pass all reported green through it. Someone opening
      the window and reading the console found it in one attempt.
