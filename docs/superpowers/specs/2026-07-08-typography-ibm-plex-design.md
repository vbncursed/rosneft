# Typography: migrate to IBM Plex — design

Date: 2026-07-08
Status: approved, ready for implementation

## Goal

Replace the default Next.js typeface pair (Geist Sans + Geist Mono) with a more
distinctive, cohesive technical type system that reinforces the app's existing
"instrument / HUD" character (dark radial background, cyan accent, uppercase
letter-spaced eyebrows, tabular data, mono hashes/coordinates).

The user originally asked for Inter. We deliberately chose **against** plain
"Inter everywhere" — it is the single most templated choice in web UI and would
flatten the app's technical identity. The user selected a bolder technical
pairing and the cohesive display option.

## Decision

Adopt the **IBM Plex** family as a two-face system:

| Role         | Font          | Where                                             | Weights        |
| ------------ | ------------- | ------------------------------------------------- | -------------- |
| Body / UI    | IBM Plex Sans | all interface text, buttons, eyebrows, headings   | 400 / 500 / 600 |
| Data / mono  | IBM Plex Mono | hashes, coordinates, dimensions, `tabular-nums`   | 400 / 500      |

- Headings use IBM Plex Sans at heavier weight (600) + `tracking-tight` — no
  separate display face (YAGNI; the app has few large headings and cohesion
  wins).
- `subsets: ["latin", "cyrillic"]` — Plex covers Cyrillic, safe for future RU
  copy. (Brand is "Andrey"; the banned word rule is unaffected — this is purely
  a glyph-coverage choice.)

### Font-loading specifics (verified against `next/font` font-data.json)

- **IBM Plex Sans** ships a `variable` axis → load WITHOUT a `weight` array
  (same pattern Geist used). Variable covers the 400/500/600 actually used
  (`font-medium` ×22, `font-semibold` ×42, body 400).
- **IBM Plex Mono** has NO variable axis → must pass `weight: ["400", "500"]`
  explicitly. Mono is used sparingly (2 `font-mono` sites + data).

## Scope of change (2 files)

1. **`frontend/src/app/layout.tsx`**
   - Swap imports `Geist, Geist_Mono` → `IBM_Plex_Sans, IBM_Plex_Mono` from
     `next/font/google`.
   - Instantiate with CSS variables `--font-plex-sans` / `--font-plex-mono`,
     `subsets: ["latin", "cyrillic"]`, mono with explicit weights.
   - Update the `<html>` `className` to reference the new variable names.

2. **`frontend/src/app/globals.css`**
   - Repoint the `@theme inline` tokens:
     `--font-sans: var(--font-plex-sans)`, `--font-mono: var(--font-plex-mono)`.
   - `body { font-family: var(--font-sans) }` stays as-is → whole UI switches
     automatically.

No other file references Geist (verified via grep). No component markup,
Tailwind classes, colors, spacing, or layout change.

## Out of scope (YAGNI)

- No third display face (no Space Grotesk / Plex Mono headings).
- No changes to component class names, colors, spacing, or layout.
- No `@apply` wrappers or new design tokens beyond the font remap.
- No changes to `tabular-nums` / tracking usages — they inherit the new faces.

## Verification

1. `yarn lint` — must pass (200-line cap unaffected; layout.tsx stays small).
2. `yarn build` — must compile; confirms next/font resolves both families.
3. Visual smoke check: home (`/`), a territory viewer, and an auth screen —
   confirm headings, eyebrows, body, and mono data render in Plex with correct
   weights and no fallback flash.

## Rollback

Revert the two-file diff; nothing else depends on the change.
