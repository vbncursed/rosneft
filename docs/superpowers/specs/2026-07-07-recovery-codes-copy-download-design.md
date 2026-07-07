# Recovery codes: copy + download

**Date:** 2026-07-07
**Status:** Approved (design)
**Scope:** Frontend only. Backend already returns the codes; no API change.

## Problem

`recovery-codes.tsx` tells the user "Save these recovery codes… they won't be
shown again" but offers no way to copy or save them — only an "I saved them"
button. A user can dismiss the screen having saved nothing.

## Solution

Extend the single component `frontend/src/auth/presentation/account/recovery-codes.tsx`:

- **Copy** button — `navigator.clipboard.writeText(codes.join("\n"))` +
  `notify.success`. Reuses the exact pattern already in
  `two-factor-section.tsx:125` (TOTP-secret copy).
- **Download .txt** button — native `Blob` + `<a download>`, no dependency.
  File: `andrey-recovery-codes.txt`, one code per line, one header line.
- **Gate** — track a local `saved` boolean; either action sets it. "I saved
  them" is `disabled` until `saved` is true, so the screen can't be dismissed
  without at least copying or downloading once.

## Constraints / decisions

- Brand string in the file is **"Andrey"**, never "Rosneft" (project rule).
- Component is rendered inside the already-`"use client"` `two-factor-section`,
  so `useState` works without adding a directive.
- Stays under the 200-line file cap (~35 lines).

## Out of scope (YAGNI)

PDF/print, per-code copy, download library, backend changes.

## Verification

Manual: enable 2FA (fix phone clock first, or use the macOS Passwords code) →
recovery-codes screen → Copy fills clipboard, Download saves the .txt with all
codes, "I saved them" is disabled until one is used.
