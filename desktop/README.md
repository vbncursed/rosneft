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

Every unpackaged run (`make dev`) and every run with `DESKTOP_UPSTREAM` set uses
the user-data directory `<userData>-dev`. That is deliberate: a dev build never
shares the installed app's cookie, cache or single-instance lock, so the two run
side by side. It matters for more than tidiness: an unpackaged run has no fuses,
so it cannot read the installed app's encrypted cookie store and would write
plaintext cookies into it, which can sign the installed app out.

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
   routes (`auth/me`, `territories`, one territory, its `scene`, `models`, `jobs`).
   Nothing with a query string is stored. A 502, 503, 504 or 520-527 from the
   server counts as "unreachable": the saved copy is served and the app reads
   as offline; with no copy the answer passes through. Any other status is the
   server speaking and passes through.
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

**A dev run does not touch the Keychain for cookies.** `make dev` has no fuses,
so its cookies are plaintext in its own `-dev` profile.

**On macOS a release asks for Keychain access once, not after every update.**
It encrypts cookies with a key kept in the keychain ("Andrey Safe Storage"). The
ACL authorises the *binary that asked*, identified by its designated requirement.
An ad-hoc signature makes that the cdhash, which changes with every build; a
release signed with one stable self-signed certificate makes it "certificate leaf
= that certificate", the same in every build, so **Always Allow** survives
updates. A build made without the certificate (a fork's PR, a local `make build`)
is ad-hoc signed and asks again.

The certificate lives in `~/.andrey-signing/` on the maintainer's machine (`.p12`,
its password, and a one-line base64 of the `.p12`). **Back it up.** Lose it and
the next certificate has a new identity: one extra Keychain prompt after that
update, then stable again. CI reads it from two repository secrets,
`MAC_CSC_LINK` (the base64 line) and `MAC_CSC_KEY_PASSWORD`, on the macOS job
only; `mac.sign` in `electron-builder.yml` (`src/signing.ts`) imports it into a
throwaway keychain. Without the secrets the build falls back to ad-hoc. It is not
an Apple certificate, so Gatekeeper still needs the `xattr` step below.

The mac build runs with the hardened runtime (`build/entitlements.mac.plist`:
JIT, unsigned executable memory, no library validation), which blocks
`DYLD_INSERT_LIBRARIES` and debugger attach. Check a build with
`codesign -dv --verbose=4 <app>` (`flags=…(runtime)`) and
`codesign -d --entitlements :- <app>` (the three keys).

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

Builds are **not Apple- or Microsoft-signed**, and every OS will object. macOS
builds carry a self-signed certificate (an ad-hoc signature when built without
it), which Apple Silicon needs to run an arm64 binary at all; it is not a
Developer ID.

- **macOS**: `Andrey-*-macos-arm64` for Apple Silicon, `Andrey-*-macos-x64`
  for Intel, each as `.dmg` and `.zip`.
  1. Open the dmg (or unzip) and drag Andrey to `/Applications`.
  2. The first launch is blocked as *"damaged"* or *"cannot be opened"*. The
     file is fine. Run `xattr -dr com.apple.quarantine /Applications/Andrey.app`,
     or try to open the app once, then go to System Settings, Privacy &
     Security, and press *Open Anyway* (it appears only after that blocked
     attempt and stays for about an hour).
  3. On first launch macOS asks for the Keychain item "Andrey Safe Storage".
     Allow it (*Always Allow*); it holds the key that encrypts your sign-in
     cookie. Updates do not ask again.
- **Windows**: `Andrey-*-windows-x64-setup.exe` or
  `Andrey-*-windows-x64-portable.exe`. SmartScreen says "Windows protected your
  PC": press *More info*, then *Run anyway*. The portable `.exe` needs no
  install and shares its data with the installed version.
- **Linux**: `Andrey-*-linux-x86_64.AppImage` or `Andrey-*-linux-amd64.deb`.
  - AppImage: `chmod +x Andrey-*.AppImage && ./Andrey-*.AppImage`. Ubuntu
    22.04 and newer may need `sudo apt install libfuse2`.
  - deb: `sudo apt install ./Andrey-*.deb`.
  - Without libsecret or KWallet (a keyring) the sign-in cookie is only
    obfuscated, not encrypted.
- **Sign-in**: keep "Keep me signed in on this device" ticked, or you are
  signed out every time the app closes.

There is no auto-update. Pull requests and manual runs build the same
installers but publish nothing; they land in the run's Artifacts for 14 days.

Icons in `build/` are generated by `frontend/icons/render.py` together with the
web app's; edit a source there and rerun it, never an output.

## Baseline

Not yet measured: time to window and memory on an open territory.
