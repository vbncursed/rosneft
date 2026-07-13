# Prometheus + Grafana metrics, embedded for Root

**Date:** 2026-07-13
**Status:** Approved design

## Goal

Instrument every backend service with Prometheus metrics, run Prometheus +
Grafana in the compose stack, and embed the Grafana dashboards inside the site
at `/admin/metrics` — visible **only to Root** (`principal.isOwner`).

## Locked decisions

| Decision | Choice |
|----------|--------|
| Display on site | Embed Grafana dashboards via `<iframe>` at `/admin/metrics` |
| Metric scope | RED (gRPC + HTTP, auto) + Go runtime + domain metrics |
| Prometheus/Grafana placement | Compose services, **not** exposed publicly (`expose`, no `ports`) |
| Access gating | Next.js BFF proxy (session cookie → `isOwner`) → Grafana `auth.proxy` |
| `/metrics` auth | Compose-network only, no bearer token |
| Alerting | Grafana Unified Alerting (embedded), in-app only, extended rule set |

### Why the BFF gates, not the Go gateway

The Go gateway authenticates via **Bearer token only**. An `<iframe>` loads
Grafana's subresources (HTML/CSS/JS/API) as ordinary browser requests that
**cannot** carry an `Authorization` header — but **do** automatically send the
same-origin httpOnly `session` cookie. Only the cookie-carrying Next BFF proxy
(`src/app/api/**`) can gate iframe subresource traffic. Prometheus/Grafana
still live in compose, unexposed — consistent with "behind a proxy checking
isOwner"; the proxy is just the Next BFF.

## Architecture

### 1. Shared package `pkg/metrics`

Single wiring point, reused by every service:

- `prometheus.Registry` + `collectors.NewGoCollector()` (mem/GC/goroutines) +
  `NewProcessCollector()` (CPU/FD).
- gRPC RED interceptors (unary + stream): `grpc_server_handled_total{service,
  method,code}` + `grpc_server_handling_seconds` histogram. Added **into the
  `grpcutil.NewServer` chain** so catalog/auth/twofa/passkey/content/mesh-api/
  upload are covered at once.
- HTTP RED middleware (`promhttp` instrumentation): `http_requests_total{method,
  route,code}` + duration histogram, for gateway and asset.
- `Serve(addr)` — small HTTP server exposing `/metrics` via `promhttp.Handler`
  on an internal metrics port (`*_METRICS_ADDR`, e.g. `:9101`), started from
  each service bootstrap. `mesh-worker` has no server today → gets a bare
  metrics listener.

**New direct dependency:** `github.com/prometheus/client_golang` (currently only
transitive `client_model` is vendored).

### 2. Domain metrics (hand-instrumented at call sites)

- **mesh-worker:** `conversions_total{status}`, `conversion_duration_seconds`,
  Redis queue-depth gauge.
- **upload-service:** `upload_bytes_total`, `uploads_total{status}`.
- **auth-service:** `logins_total{status}`; **twofa-service:**
  `twofa_verifications_total{status}`.

### 3. Compose additions

- `prometheus`: scrapes each service's `/metrics` via static config keyed on
  compose hostnames; `expose` only, TSDB retention ~15d, named volume.
- `grafana`: provisioned Prometheus datasource + provisioned dashboard JSON
  (Services RED / Go runtime / Domain + an Alerts dashboard with an **Alert
  list** panel). Settings: `auth.proxy=true`, anonymous **off**,
  `allow_embedding=true`, Grafana Live disabled, **unified alerting on**.
  `expose` only, named volume for state.

### 3a. Alerting (Grafana Unified Alerting, embedded)

No separate Alertmanager container — Grafana's built-in Alertmanager. Rules,
notification policy, and contact point are all provisioned as YAML alongside
datasource/dashboards.

- **Delivery:** in-app only. Contact point is the **null / no-op receiver**;
  firing alerts are viewed on `/admin/metrics` via a Grafana **Alert list**
  panel (embedded like the other dashboards). No external channel (no SMTP /
  Telegram / extra container). A push channel can be added later by swapping
  the contact point — rules stay unchanged.
- **Extended rule set (~8–10, provisioned):**
  1. Target down (any service `up == 0`).
  2. High HTTP 5xx / gRPC non-OK error rate.
  3. High p99 latency (gRPC/HTTP).
  4. Conversion failures spike (mesh-worker `conversions_total{status="failed"}`).
  5. Memory / goroutine growth (leak signal).
  6. Redis queue depth sustained high.
  7. Upload error rate.
  8. Failed-login / 2FA-verification spike (possible brute force).

### 4. Frontend

- **BFF proxy** `src/app/api/grafana/[...path]/route.ts` — mirrors the existing
  `api/[...path]/route.ts` pattern: read `session` cookie → `getMe()` → if
  `!isOwner` return **403**; else proxy to `grafana:3000` injecting
  `X-WEBAUTH-USER: <username>`. Grafana trusts users only from this header,
  which the proxy sets only for owners.
- **Page** `src/app/admin/metrics/page.tsx` — SSR gate
  `if (!p?.isOwner) redirect("/")`, renders `<iframe src="/api/grafana/d/<uid>?kiosk">`.
- **Sidebar** — add "Metrics" link, visible when `isOwner` (alongside existing
  `showAccess={p.isOwner}`).

## Explicitly out of scope (YAGNI)

- postgres-exporter / redis-exporter (+2 containers; add later as one scrape job).
- External alert channels (SMTP / Telegram); standalone Alertmanager container.
  In-app viewing only for now; add a contact point later without touching rules.
- Grafana Live / WebSocket streaming (dashboards poll instead).
- Long-term storage / Thanos (local Prometheus TSDB, ~15d retention).

## Testing

- `pkg/metrics`: unit test the interceptor records the expected counter/label on
  a fake handler (success + error code paths).
- Manual E2E: bring up compose, hit a few endpoints, confirm `/metrics` exposes
  counters, Prometheus targets are `up`, Grafana renders, `/admin/metrics`
  returns the dashboard for Root and **403** for a non-owner via the BFF.
- Alerting: stop one service (or force a conversion failure) and confirm the
  matching rule fires and appears in the Alert list panel on `/admin/metrics`.

## Deployment

Prod compose project `andrey` at `/opt/rosneft` (pass `-p andrey`). New
services + rebuilt Go images. Grafana/Prometheus volumes are new; no migration.
Prod Grafana root URL must be set so `?kiosk` iframe links resolve under
`andrey.vbncursed.fun`.
