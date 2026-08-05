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
git tag desktop-v0.1.0 && git push origin desktop-v0.1.0
```

The version in the tag should match `version` in `src-tauri/tauri.conf.json`;
nothing enforces that, and a mismatch is only visible to whoever reads both.

**Every other run** — pull requests touching `desktop/` or `frontend/`, and
manual runs from the Actions tab — builds the same installers but publishes
nothing: they land in the run's **Artifacts** section and expire after 14
days. `tagName` is set only on a tag push, so a pull request cannot publish a
release even if it edits this workflow.

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

## Icons are placeholder artwork, but a complete set

Every file in `src-tauri/icons/` is a rescale of `frontend/public/apple-icon.png`
— the artwork is the web app's, not something drawn for a desktop icon, and it
carries no rounded-rect mask, no per-size hinting, and nothing that reads at
16px. Replace it before anyone outside the team sees a build.

The set itself is complete and load-bearing: `icon.ico` is **required** on
Windows, where `tauri-build` generates a resource file from it and fails the
build outright without one — `icons/icon.ico not found`, after a full release
compile. A single `icon.png` is enough for macOS and Linux, which is why this
only surfaced on the Windows runner.

**The shapes differ per platform on purpose.** `icon.icns` is masked to a
superellipse and inset to Apple's grid — 824px of artwork on a 1024px canvas,
transparent margins included. macOS does not apply that mask for you: ship a
full-bleed square and the app sits visibly larger than every neighbour in the
Dock. Windows and Linux take the square PNG and `.ico` unmasked, which is why
`icon.png` and the sized PNGs still have opaque corners — do not "fix" them to
match the macOS one.

Regenerating from new artwork needs no Tauri CLI:

```bash
cd src-tauri/icons
# Square set — Windows and Linux, unmasked.
python3 -c "
from PIL import Image
s = Image.open('icon.png').convert('RGBA')
s.resize((256,256)).save('icon.ico', sizes=[(16,16),(32,32),(48,48),(256,256)])
for n, px in [('32x32.png',32), ('128x128.png',128), ('128x128@2x.png',256)]:
    s.resize((px,px)).save(n)
"
# macOS — superellipse mask, 824 of artwork on a 1024 canvas.
python3 -c "
from PIL import Image, ImageDraw
import math
def mask(size, n=5.0, ss=4):
    big = size*ss; m = Image.new('L',(big,big),0); r = big/2.0
    pts=[]
    for i in range(2048):
        t = 2*math.pi*i/2048; ct, st = math.cos(t), math.sin(t)
        pts.append((r+math.copysign(abs(ct)**(2/n),ct)*r,
                    r+math.copysign(abs(st)**(2/n),st)*r))
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.resize((size,size), Image.LANCZOS)
body = Image.open('icon.png').convert('RGBA').resize((824,824), Image.LANCZOS)
body.putalpha(mask(824))
c = Image.new('RGBA',(1024,1024),(0,0,0,0)); c.paste(body,(100,100),body)
c.save('macos_master.png')
"
mkdir -p icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s macos_master.png --out icon.iconset/icon_${s}x${s}.png
  sips -z $((s*2)) $((s*2)) macos_master.png --out icon.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns icon.iconset -o icon.icns && rm -rf icon.iconset macos_master.png
```

`icon.icns` for macOS comes from `sips` + `iconutil`; `cargo tauri icon` does
all of it in one step if you have the CLI installed.

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
