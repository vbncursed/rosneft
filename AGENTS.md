# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Commands

All commands run from `frontend/`:

```bash
yarn dev          # Start dev server
yarn build        # Production build
yarn start        # Start production server
yarn lint         # ESLint (flat config, eslint.config.mjs)
```

## Stack

- **Next.js 16.2.2** (App Router) with **React 19**
- **TypeScript** (strict mode, bundler module resolution)
- **Tailwind CSS 4** via `@tailwindcss/postcss` — uses `@import "tailwindcss"` and `@theme inline` syntax, not v3 `@tailwind` directives
- **ESLint 9** flat config with `eslint-config-next` (core-web-vitals + typescript)

## Architecture

- Monorepo root with single `frontend/` app
- App Router: all routes in `frontend/app/` (no `src/` directory)
- Path alias: `@/*` maps to `frontend/*`
- Fonts: Geist Sans and Geist Mono loaded via `next/font/google`, exposed as CSS variables
- Theme: CSS custom properties (`--background`, `--foreground`) with dark mode via `prefers-color-scheme`
- PostCSS config uses `@tailwindcss/postcss` plugin (not the legacy `tailwindcss` plugin)

## Key Differences from Common Next.js Patterns

- Next.js 16 may have API changes vs 14/15 — always check `frontend/node_modules/next/dist/docs/` for current API docs
- Tailwind v4 syntax: `@theme inline` block for design tokens, `@import "tailwindcss"` instead of `@tailwind base/components/utilities`
- ESLint uses flat config (`defineConfig` from `"eslint/config"`) not legacy `.eslintrc`
