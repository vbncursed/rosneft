# Andrey Desktop

Electron shell around the production SPA. The window opens the production
origin (`https://andrey.vbncursed.fun`) in the `persist:andrey` session
partition, so online it is the same site, the same cookie and the same
single-origin rules the frontend was built for. Offline is the main process's
job: it intercepts every request to that origin (`ses.protocol.handle`) and, when
the network is gone, answers from disk. Nothing from `frontend/` is embedded, so
a frontend change cannot break this build.

Design: [`docs/superpowers/specs/2026-10-01-electron-desktop-design.md`](../docs/superpowers/specs/2026-10-01-electron-desktop-design.md)

## Prerequisites

- Node 24 and yarn 1. `yarn --cwd desktop install` once.
- Nothing else. The CI runners build every installer type, `.deb` included,
  with what they ship.

## Commands

```bash
make check                                      # typecheck + oxlint + vitest
make dev                                        # compile and start against production
DESKTOP_UPSTREAM=http://localhost:3000 make dev # against a local frontend
make build                                      # installers for the current OS, into release/
```

For a local backend, run the frontend's dev server (`yarn --cwd frontend dev`,
port 3000, which proxies `/api`) and point the shell at it with
`DESKTOP_UPSTREAM=http://localhost:3000`.

When `DESKTOP_UPSTREAM` is set the user-data directory becomes
`<userData>-dev`. That is deliberate: a dev build never shares the installed
app's cookie, cache or single-instance lock, so the two run side by side.

`make build` runs electron-builder with the targets in `electron-builder.yml`:
dmg + zip (arm64 and x64), NSIS setup + portable (x64), AppImage + deb (x64).
Passing `--mac --arm64` on the command line does **not** narrow the yml's arch
list. A local dmg needs electron-builder's dmgbuild bundle, downloaded on first
use; `CUSTOM_DMGBUILD_PATH` points it at a copy you already have.

## How offline works

Three layers, all on disk under the profile's `cache/`:

1. **The shell** — the SPA's own files. The frontend build emits
   `shell-manifest.json` (an id plus every file and its size). After a
   successful page load the main process downloads the listed files into a new
   *generation*, checks each size, and only then switches to it. A failed
   refresh keeps the current generation; old ones are swept. With no network
   the app boots and serves any route from the current generation.
2. **Snapshots** — the last good answer of a fixed whitelist of `GET /api`
   routes (`auth/me`, `territories`, one territory, its `scene`, `models`).
   Nothing with a query string is stored.
3. **Blobs** — `GET /api/assets/{hash}`, per user, each verified against its
   own SHA-256 before it is kept. They are evicted least-recently-*modified*
   first once the cache passes the limit (5, 10, 20 or 50 GB, 10 by default,
   set on `/account` under Storage). **Save offline** on a territory pins
   every blob the viewer needs for it, and pinned blobs are never evicted.

The cache is split by user, and signing in or out forgets whose it is until the
next `/api/auth/me`, so a second account never sees the first one's files.

**A frontend that carries `shell-manifest.json` has to be in production before
a shell release goes out.** Without it the shell has nothing to download and,
because nginx answers an unknown path with `index.html`, says nothing about it:
the app works online and does not boot offline.

## Session and the keychain

Sign-in is the ordinary cookie, kept by Chromium in the profile. It is
encrypted on disk because the build turns on Electron's `EnableCookieEncryption`
fuse (`electronFuses` in `electron-builder.yml`; Electron ships it off, and then
the cookie database is plaintext). The key comes from the OS store: Keychain on
macOS, DPAPI on Windows, libsecret/KWallet on Linux. On Linux with neither,
Chromium falls back to `basic_text`, a hard-coded key that only obfuscates, and
the shell logs a warning; sign-in still works.

**Keep "Keep me signed in on this device" ticked.** Without it the gateway
issues a session cookie with no expiry date, which Chromium drops when the app
quits, so every launch starts at the sign-in screen, and offline you cannot sign
in at all.

**On macOS an unsigned dev build asks for Keychain access after every
rebuild.** The ACL authorises the *binary that asked*, by signature, and every
rebuild is a binary that was never on the list; **Always Allow** does not stick.
That is the OS working as designed, not something the shell can code around. A
signed release has a stable identity and is authorised once. `make dev` opens
its window and works while the prompt is up.

## Passkeys

Off in the shell on every OS today (`PASSKEYS` in `src/main.ts`; the SPA reads it
as `window.desktop.passkeys` and draws no passkey controls).

| OS | Works | Why |
|---|---|---|
| macOS | no, needs signing | Touch ID needs a `keychain-access-groups` entitlement for `app.configureWebAuthn`, i.e. a Developer ID signature these builds do not have. Confirmed in the spike. |
| Windows | not verified | Windows Hello is the OS's, but no build has been tried. |
| Linux | not verified | No platform authenticator is expected. |

Passwords and 2FA are unaffected.

## Installing an unsigned build

Releases are on [GitHub](https://github.com/vbncursed/rosneft/releases),
published by pushing a `desktop-v*` tag whose version matches `package.json`
(the workflow refuses a mismatch before building):

```bash
git tag desktop-v0.3.0 && git push origin desktop-v0.3.0
```

Builds are **not code-signed**, and every OS will object. Only macOS carries an
ad-hoc signature, which Apple Silicon needs to run an arm64 binary at all; it is
not a Developer ID.

- **macOS** reports the app as *"damaged and can't be opened"*. The message is
  misleading, the file is fine. After dragging it to `/Applications`:
  `xattr -dr com.apple.quarantine /Applications/Andrey.app`
- **Windows** shows SmartScreen: *More info → Run anyway*. The portable `.exe`
  needs no install.
- **Linux** needs `chmod +x` on the `.AppImage`, or
  `sudo apt install ./Andrey-*.deb`.

There is no auto-update. Pull requests and manual runs build the same
installers but publish nothing; they land in the run's Artifacts for 14 days.

Icons in `build/` are generated by `frontend/icons/render.py` together with the
web app's; edit a source there and rerun it, never an output.

## Baseline

Not yet measured: time to window and memory on an open territory.
