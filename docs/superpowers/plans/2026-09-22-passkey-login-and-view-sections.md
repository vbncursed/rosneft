# Passkey sign-in and collapsible View sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (A) bring back passwordless sign-in with a passkey on the login screen; (B) the View tab's Panoramas and Documents lists fold like a model group on the Placements tab.

**Spec:** approved in chat on 2026-09-22 (bounded changes to existing flows; no separate spec file). The decisions are restated per task below — they are binding.

## Global Constraints

- yarn only; `yarn lint` (= `tsc -b --noEmit && oxlint`) is the type check; 200-line cap; FSD layering.
- Icons via `@/shared/ui/icon`; icon-only controls name themselves via `Tooltip`/`Button shape="icon"` (see `frontend/CLAUDE.md`).
- Stage by path; never `git stash`/`checkout`/`reset`/`restore`/`add -A`; kill only processes you started; never touch production.
- Branch `dev`; trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task A: Passkey sign-in on the login screen

**Why it is off:** `pages/login/model/use-login.ts` leaves `onPasskey` undefined — "the gateway's passkey RP origin is pinned to the other SPA's dev port". That was true while this app was `frontend-v2`; it now *is* the frontend. Production `PASSKEY_RP_ORIGINS` is `https://andrey.vbncursed.fun`; local compose pins port 3000. The login client (begin/finish) was deleted with the old app (it lived in commit `0fce57e4`); only registration survives here.

**Decisions:**
- `entities/passkey/api/passkey-gateway.ts`: add `beginLogin(): Promise<{ optionsJson: string; flowId: string }>` → `POST /api/auth/passkey/login/begin`, and `finishLogin(flowId: string, credentialJson: string)` → `POST /api/auth/passkey/login/finish` (`PasskeyLoginFinishRequest` / `TokenResponse` in `backend/services/gateway-service/api/openapi.yaml`). Mirror `beginRegistration`/`finishRegistration`.
- The ceremony uses `@github/webauthn-json` (`get`) the same way registration uses `create` — find that call in `features/passkey-manage` and follow it.
- After `finishLogin`, do **exactly what the password login does on success** — CSRF token, session marker, `me` query, navigation to `next` — by reusing the same code path (read `login()` and `goToTarget` in `use-login.ts`, and whatever `login()` calls in `features`/`entities`). Do not duplicate session bookkeeping; extract a shared "signed in" step if needed.
- `use-login.ts`: pass `onPasskey` only when `isPasskeySupported()` (`entities/passkey`, the single gate — desktop shell stays off). Replace the stale comment with the real reason for the gate.
- A user cancelling the OS dialog (`NotAllowedError` / `AbortError`) shows nothing; any other failure shows the form's error line ("Passkey sign-in failed. Try again or use your password."). Guard double clicks like `submitCredentials` does.

**Tests:** gateway functions (request body/route/response mapping); `useLogin` exposes `onPasskey` when supported and not when `__DESKTOP__`; success path runs the same post-login step as the password path and navigates to `next`; cancel → no error; failure → error. The login page shows the passkey button and `PASSKEY_SUB` copy when `onPasskey` is present (already covered by existing page specs — keep them green).

**Live check:** local stack (`PASSKEY_RP_ORIGINS` = `http://localhost:3000`, check `docker-compose.yml`), `yarn dev --port 3000`. Use Playwright Chromium with a CDP virtual authenticator (`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator` with `protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true`): sign in with a password, register a passkey on the account page, sign out, sign in with the passkey, land on the home page. Remove the test passkey afterwards. Screenshots to `scratchpad/passkey-a/`.

- [ ] failing tests → implement → tests + lint → live check → coverage → commit `feat(frontend): sign in with a passkey again`.

---

### Task B: Panoramas and Documents fold like a Placements group

**Decisions:**
- In `widgets/view-tab/ui/view-tab.tsx` the Panoramas and Documents section heads become fold toggles styled like `entities/placement/ui/group-row.tsx`: title, count, a `chevron-right` that rotates 90° when open (150 ms `ease-out`, `motion-reduce:transition-none`), `aria-expanded`, `aria-controls` → the list. The upload "↑" button stays in the head and must not toggle the fold (it is a separate control, not nested inside the toggle button — nested buttons are invalid).
- Only the **list** folds (`ul[data-tour="panorama-picker"]` and the document list). The markers switch / Move points / external link / anchor editor stay visible: they are section settings, not list items.
- Default **folded**; the reader's choice is remembered per section in `localStorage` — reuse `shared/lib/use-stored-switch.ts` if it fits (read it; keys like `andrey.view.panoramas` / `andrey.view.documents`, same try/catch tolerance as `use-overlays-panel.ts`).
- Forced open, without overwriting the remembered choice (the pattern `useOverlaysPanel` uses for `forceExpanded`):
  - Panoramas: while a panorama is active (you stand in it) or being edited (`calibrating`/editor open), and while a guided tour is running (the viewer tour's `panorama-picker` step and the panorama tour anchor into the list).
  - Documents: while a guided tour is running (the `add-document` anchor is in the head, but keep behaviour symmetric).
  Thread a `forceOpen` input through `ViewTab` props from the page model (`pages/territory-viewer/model`, where `tour.active || panoramaTour.active` is already known) — apply during render, not from an effect, so the tour's anchor exists in the same commit.
- The rail's Panoramas / Documents tiles (`revealSection`) scroll to the section: when folded they should also open it (they express "show me the panoramas"). Keep it minimal: opening sets the remembered state to open.

**Tests:** head toggles fold, `aria-expanded` flips, list hidden/shown; default folded; remembered value read on mount and written on toggle (storage failures tolerated); forced open for active/editing panorama and for a running tour without changing the stored value; the upload button does not toggle; the rail tile opens the folded section. Update tour specs if they assumed the list is always present.

**Live check** (local stack, `dji-wp46-cut` has 15 panoramas, 1 document; 1280×800, both themes): folded by default, open/close, reload keeps the choice, entering a panorama opens Panoramas, the guided tour steps 6/7/9/10/11/12 still land (reuse the harness in `scratchpad/live4`), the rail tiles open the sections. Screenshots to `scratchpad/sections-b/`. Reset/restore `admin`'s `onboarding_tours_seen` (`{viewer,panorama}` at the end).

- [ ] failing tests → implement → tests + lint → live check → coverage → commit `feat(frontend): Panoramas and Documents fold like a Placements group`.
