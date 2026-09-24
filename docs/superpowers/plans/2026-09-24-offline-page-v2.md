# Offline page v2 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `frontend/public/offline.html` to the Claude Design mock `Offline v2.dc.html` (stages `offline`, `checking`, `back`) and make it return the reader to their page by itself once the server answers.

**Architecture:** Still one self-contained document the service worker serves when a navigation fails (`public/sw.js`): inline styles, the theme tokens copied from `src/app/styles/theme.css`, the system font stack, and now a small inline script — theme from the app's own `localStorage["andrey.theme"]`, a reachability probe (`fetch("/", {method: "HEAD", cache: "no-store"})`, which the worker lets past because it is not a navigation), and `location.reload()` once it answers. The worker's cache is renamed so installed copies fetch the new page.

**Tech Stack:** plain HTML/CSS/JS (no bundle — it is unreachable offline), service worker, Python Playwright for the live check.

**Spec:** bounded task; the design was approved in chat on 2026-09-24 and is restated under "Design". Mock: Claude Design project `b5fa4afe-073c-4f90-8239-acaff290c342`, `Offline v2.dc.html`.

## Global Constraints

- Work on branch `dev`. Code, comments, commits in English. yarn only.
- A parallel session may work in `backend/`: never `git stash`, `git checkout -- …`, `git reset`, `git restore`; commit by explicit pathspec only (`git add <paths> && git commit --no-verify -F <msg> -- <paths>`), paths written literally; check `git show --stat HEAD`. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; `--no-verify` because the hook runs the Go gate — say so. Don't push. Kill only processes you started (by PID).
- The page may load nothing: no external font, stylesheet, script or image. Everything inline.
- Colours are the tokens of `src/app/styles/theme.css` (its lifted `--dim` / light `--muted`, not the mock's), both themes, keyed the same way the app keys them: `:root`/`[data-theme="dark"]` dark, `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])` and `:root[data-theme="light"]` light.
- The theme key is `andrey.theme`, values `dark` | `light` — the app's (`src/features/theme-toggle/model/use-theme.ts`). Every `localStorage` access in try/catch.
- Mock copy, word for word:
  - header brand `Andrey Viewer`
  - offline badge `no connection`; checking badge `checking connection`
  - h1 `You're offline`
  - body `Andrey Viewer can't reach the server. Check your Wi-Fi, cable or VPN — this page reloads by itself as soon as the connection is back.`
  - second paragraph `Nothing you saved is lost. Changes that didn't finish sending before the connection dropped need to be made again.`
  - status line `Checks again automatically` / checking `Trying the server…`
  - button `Try again` / checking `Checking…` (disabled)
  - back badge `back online`; h1 `Connection restored`; body `Reloading the page you were on.`; button `Reload now`
- `<title>` stays one name: `Andrey Viewer — offline`.

## Design

- Page: `min-height: 100dvh`, padding 32px 32px 56px (16px sides under 640px), column, gap 40px, the 40px grid drawn in `--grid` on `--bg`.
- Header: brand (mono stack, 10px, tracking .24em, uppercase, accent) left; theme toggle right — the app's compact pill (border `--line-2`, `--panel`, mono 9px, tracking .16em, uppercase, 6px 12px, radius 999px, moon/sun glyph in accent, label = the theme in effect).
- Card (max 520px, radius 16px, `--panel`, elevation), centred in the remaining height:
  - offline/checking: border `--warn`; icon tile 38px (border `--warn`, `--warn-soft`, `--warn`, wifi-off glyph); badge pill (border `--warn`, `--warn-soft`, `--warn`, mono 9px, tracking .14em, uppercase, 3px 11px); h1 28px/700/-.025em/1.1; two paragraphs (14px and 13px, 1.6, `--muted`, max 48ch); footer (`--panel-2`, top border `--line`, 16px 30px, space-between): status line (mono 10px `--dim`, `role="status"`) and the primary button (accent, 10px 18px, radius 10px, 14px/600, refresh glyph).
  - back: border `--ok`; tile and badge in `--ok`/`--ok-soft` with a check glyph; h1; one paragraph; footer right-aligned with a secondary button (border `--line-2`, `--panel`, `--fg`, 14px/500).
- Behaviour:
  - `check()` probes `fetch("/", {method: "HEAD", cache: "no-store"})`. A response of any status means the origin answers (the worker falls back only on a network error), so the stage becomes `back` and `location.reload()` runs 1200 ms later. The worker served this document *at the URL the reader asked for*, so the reload returns them there.
  - Triggers: the `online` event; every 5 s while `document.visibilityState === "visible"`; the Try again button, which shows `checking` for at least 600 ms so the press is seen.
  - One probe at a time; `back` is terminal. `Reload now` reloads at once.
  - Without JavaScript the offline card still renders with its copy (the back card is `hidden` in markup).
- Every pressable: `scale: .97` on `:active` (enabled only), `transition: scale 150ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms, border-color 150ms`; `:focus-visible` outline 2px accent, offset 2px; `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation`. Nothing else animates.

## File Structure

- Modify `frontend/public/offline.html` — the page.
- Modify `frontend/public/sw.js` — `CACHE` → `andrey-shell-v5` and a `v5:` line in its history comment.
- Modify `frontend/CLAUDE.md` — the PWA bullet: "offline.html (inline styles, no JS, …)" → inline styles and a small inline script (theme, probe, reload).

---

### Task 1: The page

**Files:** `frontend/public/offline.html`, `frontend/public/sw.js`, `frontend/CLAUDE.md`

- [ ] **Step 1: Write `offline.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="color-scheme" content="dark light" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f4f1" />
    <title>Andrey Viewer — offline</title>
    <!-- The document public/sw.js serves when a navigation fails. The bundle is
         unreachable then, so everything is inline: the tokens are copied by hand
         from src/app/styles/theme.css (keep them in step; bump CACHE in sw.js
         whenever this file changes, or installed copies keep the old page), and
         the type is the tokens' fallback stack — the Archivo and JetBrains Mono
         files are bundled assets. -->
    <style>
      :root,
      :root[data-theme="dark"] {
        --bg: #0e0f11; --panel: #16181b; --panel-2: #1c1f23; --line: #282c31; --line-2: #3a3f46;
        --fg: #f1f2f3; --muted: #9ba1a8; --dim: #81878e;
        --accent: #f97316; --accent-fg: #0e0f11;
        --ok: #4ade80; --ok-soft: rgb(74 222 128 / 0.12);
        --warn: #fbbf24; --warn-soft: rgb(251 191 36 / 0.12);
        --grid: rgb(255 255 255 / 0.04); --elevation: 0 10px 30px rgb(0 0 0 / 0.45);
        color-scheme: dark;
      }
      @media (prefers-color-scheme: light) {
        :root:not([data-theme="dark"]) {
          --bg: #f5f4f1; --panel: #ffffff; --panel-2: #faf9f7; --line: #e3e1db; --line-2: #c9c6bd;
          --fg: #16181b; --muted: #55595f; --dim: #6b6f75;
          --accent: #e5610a; --accent-fg: #ffffff;
          --ok: #15803d; --ok-soft: rgb(21 128 61 / 0.1);
          --warn: #b45309; --warn-soft: rgb(180 83 9 / 0.1);
          --grid: rgb(0 0 0 / 0.04); --elevation: 0 10px 30px rgb(20 20 18 / 0.1);
          color-scheme: light;
        }
      }
      :root[data-theme="light"] {
        --bg: #f5f4f1; --panel: #ffffff; --panel-2: #faf9f7; --line: #e3e1db; --line-2: #c9c6bd;
        --fg: #16181b; --muted: #55595f; --dim: #6b6f75;
        --accent: #e5610a; --accent-fg: #ffffff;
        --ok: #15803d; --ok-soft: rgb(21 128 61 / 0.1);
        --warn: #b45309; --warn-soft: rgb(180 83 9 / 0.1);
        --grid: rgb(0 0 0 / 0.04); --elevation: 0 10px 30px rgb(20 20 18 / 0.1);
        color-scheme: light;
      }
      html { -webkit-tap-highlight-color: transparent; }
      body {
        margin: 0;
        background-color: var(--bg);
        background-image: linear-gradient(var(--grid) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid) 1px, transparent 1px);
        background-size: 40px 40px;
        color: var(--fg);
        font-family: "Helvetica Neue", system-ui, sans-serif;
      }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .page {
        box-sizing: border-box; min-height: 100vh; min-height: 100dvh;
        display: flex; flex-direction: column; gap: 40px;
        padding: max(32px, env(safe-area-inset-top)) 32px max(56px, env(safe-area-inset-bottom));
      }
      @media (max-width: 639px) { .page { padding-left: 16px; padding-right: 16px; } }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
      .brand { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); }
      main { flex: 1; display: flex; align-items: center; justify-content: center; }
      section {
        box-sizing: border-box; width: 100%; max-width: 520px; overflow: hidden;
        border: 1px solid var(--warn); border-radius: 16px; background: var(--panel); box-shadow: var(--elevation);
      }
      section.back { border-color: var(--ok); }
      section[hidden] { display: none; }
      .head { padding: 30px; display: flex; flex-direction: column; gap: 14px; }
      .row { display: flex; align-items: center; gap: 10px; }
      .tile {
        display: flex; align-items: center; justify-content: center; width: 38px; height: 38px;
        box-sizing: border-box; border: 1px solid var(--warn); border-radius: 10px;
        background: var(--warn-soft); color: var(--warn);
      }
      .badge {
        border: 1px solid var(--warn); border-radius: 999px; padding: 3px 11px; background: var(--warn-soft);
        color: var(--warn); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      }
      .back .tile, .back .badge { border-color: var(--ok); background: var(--ok-soft); color: var(--ok); }
      h1 { margin: 4px 0 0; font-size: 28px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.1; }
      p { margin: 0; max-width: 48ch; line-height: 1.6; color: var(--muted); text-wrap: pretty; }
      .lede { font-size: 14px; }
      .note { font-size: 13px; }
      .foot {
        display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        border-top: 1px solid var(--line); background: var(--panel-2); padding: 16px 30px;
      }
      .back .foot { justify-content: flex-end; }
      .status { font-size: 10px; color: var(--dim); }
      button {
        display: inline-flex; align-items: center; gap: 8px; cursor: pointer; border-radius: 10px;
        padding: 10px 18px; font: inherit; font-size: 14px; touch-action: manipulation;
        transition: scale 150ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms, border-color 150ms;
      }
      button:enabled:active { scale: 0.97; }
      button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      button:disabled { cursor: not-allowed; opacity: 0.6; }
      .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); font-weight: 600; }
      .secondary { border: 1px solid var(--line-2); background: var(--panel); color: var(--fg); font-weight: 500; }
      .theme {
        gap: 6px; border: 1px solid var(--line-2); border-radius: 999px; background: var(--panel); color: var(--fg);
        padding: 6px 12px; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase;
      }
      .theme svg { color: var(--accent); }
      svg { display: block; flex-shrink: 0; }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <span class="brand mono">Andrey Viewer</span>
        <button id="theme" class="theme mono" type="button" hidden>
          <svg id="theme-glyph" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>
          <span id="theme-label"></span>
        </button>
      </header>
      <main>
        <section id="offline">
          <div class="head">
            <div class="row">
              <span class="tile" aria-hidden="true">
                <!-- wifi-off, Lucide (ISC), as the mock draws it -->
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.6a10 10 0 0 1 5.2-2.5"/><path d="M16.8 11.2A10 10 0 0 1 19 12.6"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="m3 3 18 18"/></svg>
              </span>
              <span id="badge" class="badge mono">no connection</span>
            </div>
            <h1>You're offline</h1>
            <p class="lede">Andrey Viewer can't reach the server. Check your Wi-Fi, cable or VPN — this page reloads by itself as soon as the connection is back.</p>
            <p class="note">Nothing you saved is lost. Changes that didn't finish sending before the connection dropped need to be made again.</p>
          </div>
          <div class="foot">
            <span id="status" class="status mono" role="status">Checks again automatically</span>
            <button id="retry" class="primary" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v6h-6"/></svg>
              <span id="retry-label">Try again</span>
            </button>
          </div>
        </section>
        <section id="back" class="back" hidden>
          <div class="head">
            <div class="row">
              <span class="tile" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </span>
              <span class="badge mono">back online</span>
            </div>
            <h1>Connection restored</h1>
            <p class="lede" role="status">Reloading the page you were on.</p>
          </div>
          <div class="foot">
            <button id="reload" class="secondary" type="button">Reload now</button>
          </div>
        </section>
      </main>
    </div>
    <script>
      (() => {
        // Theme: the app's own key, so the page matches the app the reader left.
        const KEY = "andrey.theme";
        const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>';
        const SUN =
          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
        const stored = () => {
          try {
            const v = localStorage.getItem(KEY);
            return v === "dark" || v === "light" ? v : null;
          } catch {
            return null;
          }
        };
        let theme = stored() ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
        const toggle = document.getElementById("theme");
        const paint = () => {
          document.documentElement.dataset.theme = theme;
          document.getElementById("theme-glyph").innerHTML = theme === "dark" ? MOON : SUN;
          document.getElementById("theme-label").textContent = theme;
          toggle.setAttribute("aria-label", `Theme: ${theme}. Switch to ${theme === "dark" ? "light" : "dark"}`);
        };
        toggle.addEventListener("click", () => {
          theme = theme === "dark" ? "light" : "dark";
          try {
            localStorage.setItem(KEY, theme);
          } catch {}
          paint();
        });
        toggle.hidden = false;
        paint();

        // Reachability. The worker answers only navigations from its cache, so
        // this request goes to the network; any response at all means the
        // origin answers again (the worker falls back on a network error only).
        const offline = document.getElementById("offline");
        const back = document.getElementById("back");
        const retry = document.getElementById("retry");
        const TEXT = {
          offline: ["no connection", "Checks again automatically", "Try again"],
          checking: ["checking connection", "Trying the server…", "Checking…"],
        };
        let stage = "offline";
        const set = (next) => {
          stage = next;
          if (next === "back") {
            offline.hidden = true;
            back.hidden = false;
            return;
          }
          const [badge, status, label] = TEXT[next];
          document.getElementById("badge").textContent = badge;
          document.getElementById("status").textContent = status;
          document.getElementById("retry-label").textContent = label;
          retry.disabled = next === "checking";
        };
        const reachable = () =>
          fetch("/", { method: "HEAD", cache: "no-store" }).then(() => true, () => false);
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const check = async (pressed) => {
          if (stage !== "offline") return; // one probe at a time; back is terminal
          if (pressed) set("checking");
          const [ok] = await Promise.all([reachable(), pressed ? wait(600) : null]);
          if (!ok) return set("offline");
          set("back");
          // The worker served this document at the URL the reader asked for,
          // so a reload returns them to it.
          setTimeout(() => location.reload(), 1200);
        };
        retry.addEventListener("click", () => check(true));
        document.getElementById("reload").addEventListener("click", () => location.reload());
        addEventListener("online", () => check(false));
        setInterval(() => {
          if (document.visibilityState === "visible") check(false);
        }, 5000);
      })();
    </script>
  </body>
</html>
```

Notes for the implementer:
- The theme toggle is `hidden` in markup and revealed by the script — without JS it would be a dead control. Everything else renders without JS.
- If the sun glyph's shape differs from the app's (`src/shared/ui/icon` `sun`, runeicons), copy the app's path bodies into `SUN`/`MOON` instead so the pill matches the app.

- [ ] **Step 2: `sw.js`** — `const CACHE = "andrey-shell-v5";` and add to the history comment:
`// v5: offline.html follows the Offline v2 mock and gained an inline script (theme, reachability probe, reload); renamed so installed copies refetch it.`

- [ ] **Step 3: `frontend/CLAUDE.md`** — in "Production and the desktop shell", the PWA bullet: replace `offline.html` (inline styles, no JS, the theme tokens copied by hand — …) with `offline.html` (inline styles and a small inline script — theme from `andrey.theme`, a `HEAD /` reachability probe every 5 s and on `online`, reload once it answers; the theme tokens copied by hand — …). Keep the rest of the sentence (the CACHE rule).

- [ ] **Step 4: Static checks**

Run: `cd frontend && yarn lint && yarn vitest run src/app/pwa`
Expected: pass (nothing in `src` changed; the PWA registration spec still holds). Open the file in a browser directly (`file://…/public/offline.html`): it renders, the toggle flips and persists across reload, no console error.

- [ ] **Step 5: Commit** `feat(offline): the offline page follows Offline v2 and comes back by itself` — `frontend/public/offline.html frontend/public/sw.js frontend/CLAUDE.md`.

---

### Task 2: Live verification (Playwright)

No product code.

- Serve the app yourself so the service worker registers on its own origin: `cd frontend && yarn dev --port <free>` (registration runs in dev too — `src/app/pwa/register-service-worker.ts`), or `yarn build` with `.env.production` then `yarn preview --port <free>`. Kill only your PIDs. Never touch the user's :3000.
- Python Playwright, one persistent context:

- [ ] **Step 1:** open `/login`, wait until `navigator.serviceWorker.controller` is set (reload once if needed).
- [ ] **Step 2:** `context.set_offline(True)`; `goto("/territories")` → the offline card: h1 `You're offline`, badge `no connection`, status `Checks again automatically`; screenshots dark and light (toggle via the page's own button) at 1440 and 375; no horizontal scroll at 375.
- [ ] **Step 3:** press `Try again` while still offline → within 100 ms the badge reads `checking connection`, button `Checking…` and disabled; after it settles, back to `no connection`.
- [ ] **Step 4:** `context.set_offline(False)`; within ~7 s (5 s interval + 1.2 s reload delay) the `Connection restored` card shows and the page reloads to `/territories` (or `/login?next=…` if unauthenticated — either proves the reload returned to the asked-for URL; record which).
- [ ] **Step 5:** theme persistence: set light on the offline page, go back online → the app loads light (same `andrey.theme` key).
- [ ] **Step 6:** report each step PASS/FAIL with URLs, texts, timings and screenshot paths; unregister nothing on the user's origin.

## Out of scope

- Caching anything beyond the offline document (models, bundle) — `sw.js`'s ponytail note stands.
- The desktop shell: it never registers the worker (`/sw.js` is a 404 there), so it never shows this page.
