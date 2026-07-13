# Prometheus + Grafana Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument every backend service with Prometheus metrics, run Prometheus + Grafana in compose, and embed the Grafana dashboards + alerts at `/admin/metrics` for Root users only.

**Architecture:** A shared `pkg/metrics` package exposes RED (rate/errors/duration) + Go-runtime metrics through one registry and one internal `/metrics` listener (`:9101`), wired identically into every service. gRPC RED comes free via a `grpcutil.NewServer` interceptor; HTTP RED via a chi/net-http middleware on gateway + asset. Prometheus (unexposed) scrapes all 10 processes; Grafana (unexposed) renders provisioned dashboards + unified-alerting rules. The Next.js BFF proxies `/api/grafana/*`, gating on the `session` cookie → `isOwner` and injecting `X-WEBAUTH-USER` so Grafana's `auth.proxy` trusts the request.

**Tech Stack:** Go 1.26.4, `github.com/prometheus/client_golang`, gRPC, chi v5, Prometheus, Grafana (unified alerting), Next.js 16 App Router, Docker Compose.

## Global Constraints

- **Go 1.26.4** — use modern idioms (`errors.Is`, `any`, `min`/`max`, `slices`/`maps`/`cmp`, `wg.Go`). Never features past 1.26.
- **200-line file cap** (ESLint frontend; keep Go files focused too). Split before exceeding.
- **Banned brand word:** never render "Rosneft"/"Роснефть" in displayed text. Grafana dashboard titles, folder names, and any user-visible label use **"Andrey"**. Lowercase `rosneft` in Go import paths is structural — leave it.
- **Metrics `/metrics` endpoints are internal-only** — port `:9101`, `expose` in compose, never in `ports`. No bearer/token auth on them (compose-network trust).
- **Prometheus + Grafana are never published** — `expose` only, no host `ports`. Access is exclusively through the Next BFF.
- **Compose project is `andrey`** — prod deploy runs from `/opt/rosneft` with `-p andrey`.
- **No new frontend npm dependencies** — the embed is a native `<iframe>`; the proxy reuses the existing `api/[...path]` pattern.

---

## Phase 1 — Backend instrumentation

### Task 1: `pkg/metrics` package + unit test

**Files:**
- Create: `backend/pkg/metrics/metrics.go`
- Create: `backend/pkg/metrics/grpc.go`
- Create: `backend/pkg/metrics/http.go`
- Test: `backend/pkg/metrics/grpc_test.go`
- Modify: `backend/pkg/go.mod` (add `github.com/prometheus/client_golang`)

**Interfaces:**
- Produces:
  - `metrics.Handler() http.Handler`
  - `metrics.Serve(addr string) error`
  - `metrics.UnaryServerInterceptor() grpc.UnaryServerInterceptor`
  - `metrics.StreamServerInterceptor() grpc.StreamServerInterceptor`
  - `metrics.Middleware(next http.Handler) http.Handler`
  - `metrics.Registry *prometheus.Registry` (for domain collectors to register on)

- [ ] **Step 1: Add the dependency**

Run from `backend/pkg/`:
```bash
cd backend/pkg && go get github.com/prometheus/client_golang@latest
```

- [ ] **Step 2: Write `metrics.go`**

```go
// Package metrics centralizes Prometheus instrumentation so every service
// exposes RED (rate/errors/duration) + Go-runtime metrics through one registry
// and one internal /metrics endpoint, wired the same way everywhere.
package metrics

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Registry is the process-wide metrics registry. A dedicated registry (not the
// global default) keeps behaviour explicit and avoids surprise collectors.
// Domain metrics register onto it via Registry.MustRegister in their service.
var Registry = newRegistry()

func newRegistry() *prometheus.Registry {
	r := prometheus.NewRegistry()
	r.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	return r
}

// Handler returns the /metrics HTTP handler over the shared Registry.
func Handler() http.Handler {
	return promhttp.HandlerFor(Registry, promhttp.HandlerOpts{})
}

// Serve starts a dedicated HTTP server exposing GET /metrics on addr and blocks
// until it errors. Run it in a goroutine. addr is internal-only (compose net).
func Serve(addr string) error {
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", Handler())
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	return srv.ListenAndServe()
}
```

- [ ] **Step 3: Write `grpc.go`**

```go
package metrics

import (
	"context"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/status"
)

var (
	grpcHandled = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "grpc_server_handled_total",
		Help: "Total gRPC calls completed, by service, method, and status code.",
	}, []string{"grpc_service", "grpc_method", "grpc_code"})

	grpcDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "grpc_server_handling_seconds",
		Help:    "Histogram of gRPC handler latency in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"grpc_service", "grpc_method"})
)

func init() { Registry.MustRegister(grpcHandled, grpcDuration) }

// splitMethod turns "/pkg.Service/Method" into ("pkg.Service", "Method").
func splitMethod(full string) (svc, method string) {
	full = strings.TrimPrefix(full, "/")
	if i := strings.LastIndex(full, "/"); i >= 0 {
		return full[:i], full[i+1:]
	}
	return "unknown", full
}

func record(fullMethod string, err error, start time.Time) {
	svc, method := splitMethod(fullMethod)
	grpcDuration.WithLabelValues(svc, method).Observe(time.Since(start).Seconds())
	grpcHandled.WithLabelValues(svc, method, status.Code(err).String()).Inc()
}

// UnaryServerInterceptor records RED metrics for every unary call.
func UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		record(info.FullMethod, err, start)
		return resp, err
	}
}

// StreamServerInterceptor records RED metrics for every streaming call.
func StreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		start := time.Now()
		err := handler(srv, ss)
		record(info.FullMethod, err, start)
		return err
	}
}
```

- [ ] **Step 4: Write `http.go`**

```go
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var (
	httpHandled = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests, by method and response status code.",
	}, []string{"method", "code"})

	httpDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "Histogram of HTTP request latency in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method"})
)

func init() { Registry.MustRegister(httpHandled, httpDuration) }

// statusRecorder captures the response code. Unwrap + Flush keep SSE and large
// binary streaming working when this wraps the gateway/asset writer.
type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.code = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Middleware records RED metrics for every HTTP request. Labels are method +
// status only — the URL path is deliberately omitted to bound cardinality.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		httpDuration.WithLabelValues(r.Method).Observe(time.Since(start).Seconds())
		httpHandled.WithLabelValues(r.Method, strconv.Itoa(rec.code)).Inc()
	})
}
```

- [ ] **Step 5: Write the failing test `grpc_test.go`**

```go
package metrics

import (
	"context"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestUnaryServerInterceptorRecordsCode(t *testing.T) {
	interceptor := UnaryServerInterceptor()
	info := &grpc.UnaryServerInfo{FullMethod: "/pkg.Svc/Do"}

	_, _ = interceptor(context.Background(), nil, info,
		func(ctx context.Context, req any) (any, error) { return "ok", nil })
	_, _ = interceptor(context.Background(), nil, info,
		func(ctx context.Context, req any) (any, error) { return nil, status.Error(codes.NotFound, "nope") })

	if got := testutil.ToFloat64(grpcHandled.WithLabelValues("pkg.Svc", "Do", "OK")); got != 1 {
		t.Fatalf("OK count = %v, want 1", got)
	}
	if got := testutil.ToFloat64(grpcHandled.WithLabelValues("pkg.Svc", "Do", "NotFound")); got != 1 {
		t.Fatalf("NotFound count = %v, want 1", got)
	}
}
```

- [ ] **Step 6: Run test — expect FAIL then PASS**

Run: `cd backend/pkg && go test ./metrics/ -run TestUnaryServerInterceptorRecordsCode -v`
Expected: PASS (all files written together). If a compile error appears, fix imports.

- [ ] **Step 7: Tidy + commit**

```bash
cd backend/pkg && go mod tidy && go build ./... && go test ./metrics/...
git add backend/pkg/metrics backend/pkg/go.mod backend/pkg/go.sum
git commit -m "feat(metrics): shared pkg/metrics (RED + Go runtime, gRPC + HTTP)"
```

---

### Task 2: Wire gRPC RED interceptors into `grpcutil.NewServer`

**Files:**
- Modify: `backend/pkg/grpcutil/server.go:44-57` (interceptor chains)

**Interfaces:**
- Consumes: `metrics.UnaryServerInterceptor()`, `metrics.StreamServerInterceptor()` from Task 1.

- [ ] **Step 1: Add the import and insert interceptors**

In `server.go`, add to imports:
```go
"github.com/vbncursed/rosneft/backend/pkg/metrics"
```

Change the chains so metrics runs right after recovery (recovery stays outermost to catch panics; metrics then counts the recovered error code):
```go
grpc.ChainUnaryInterceptor(
	RecoveryUnaryInterceptor(logger),
	metrics.UnaryServerInterceptor(),
	RequestIDUnaryInterceptor(),
	SlogUnaryInterceptor(logger),
),
grpc.ChainStreamInterceptor(
	RecoveryStreamInterceptor(logger),
	metrics.StreamServerInterceptor(),
	RequestIDStreamInterceptor(),
	SlogStreamInterceptor(logger),
),
```

- [ ] **Step 2: Build + commit**

Run: `cd backend/pkg && go build ./... && go test ./...`
Expected: PASS
```bash
git add backend/pkg/grpcutil/server.go
git commit -m "feat(metrics): record gRPC RED via grpcutil interceptor chain"
```

---

### Task 3: Internal `:9101` `/metrics` listener in every service

Every one of the 10 processes starts `metrics.Serve` on an internal port. Config gets a `MetricsAddr` knob (default `:9101`) resolved from `<PREFIX>_METRICS_ADDR`.

**Files (per service — the same two edits each):**

| Service | Config file (add field + default) | Serve file (add goroutine) |
|---|---|---|
| catalog | `services/catalog-service/internal/config/config.go` | `services/catalog-service/internal/bootstrap/serve.go` |
| auth | `services/auth-service/internal/config/config.go` | `services/auth-service/internal/bootstrap/serve.go` |
| twofa | `services/twofa-service/internal/config/config.go` | `services/twofa-service/internal/bootstrap/serve.go` |
| passkey | `services/passkey-service/internal/config/config.go` | `services/passkey-service/internal/bootstrap/serve.go` |
| content | `services/content-service/internal/config/config.go` | `services/content-service/internal/bootstrap/serve.go` |
| mesh-api | `services/mesh-service/internal/config/config.go` | `services/mesh-service/internal/bootstrap/run_api.go` |
| mesh-worker | `services/mesh-service/internal/config/config.go` (shared) | `services/mesh-service/internal/bootstrap/run_worker.go` |
| upload | `services/upload-service/internal/config/config.go` | `services/upload-service/internal/bootstrap/serve.go` |
| gateway | `services/gateway-service/internal/config/config.go` | `services/gateway-service/internal/bootstrap/serve.go` |
| asset | `services/asset-service/internal/config/config.go` | `services/asset-service/internal/bootstrap/serve.go` |

> Confirm exact filenames with `ls` per service before editing — the serve file is the one containing `ListenAndServe` (HTTP) or `grpcSrv.Serve` (gRPC). mesh shares one config package across api + worker; add the field once.

**Interfaces:**
- Consumes: `metrics.Serve(addr)` from Task 1.
- Produces: `cfg.MetricsAddr string` on each service Config.

- [ ] **Step 1: Add the config field (each `config.go`)**

Add to the `Config` struct:
```go
MetricsAddr string `mapstructure:"metrics-addr"`
```
Add to the defaults block (next to the other `v.SetDefault` calls):
```go
v.SetDefault("metrics-addr", ":9101")
```
If the service registers cobra persistent flags (grep `flags.String` in its `cmd/*/main.go`), add:
```go
flags.String("metrics-addr", ":9101", "internal /metrics listen address")
```

- [ ] **Step 2: Start the listener (each serve file)**

Add near the other goroutine launches (after the logger exists, before/with the main `Serve`/`ListenAndServe`). Ensure `net/http`, `errors`, and the metrics package are imported:
```go
go func() {
	if err := metrics.Serve(cfg.MetricsAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("metrics: listener failed", "err", err)
	}
}()
logger.Info("metrics: serving", "addr", cfg.MetricsAddr)
```
Import path: `"github.com/vbncursed/rosneft/backend/pkg/metrics"`.

- [ ] **Step 3: Add HTTP RED middleware on the two HTTP services**

**gateway** — `services/gateway-service/internal/bootstrap/transport.go`, in `InitRouter`, add as the first middleware (before `middleware.RequestID`) so it wraps everything:
```go
r.Use(metrics.Middleware)
```
**asset** — locate its router/mux construction (grep `http.Handler` / `ServeMux` / `chi.NewRouter` in `services/asset-service/internal/`), wrap the top-level handler:
```go
handler = metrics.Middleware(handler)
```
Import `"github.com/vbncursed/rosneft/backend/pkg/metrics"` in both.

> Do NOT add a `/metrics` route to the gateway's public chi router or asset's public mux — `/metrics` is served only by the internal `:9101` listener from Step 2, so it never reaches the exposed `:8080`/`:8081` surface.

- [ ] **Step 4: Build every service + commit**

Run: `cd backend && go build ./... && go vet ./...`
Expected: PASS
```bash
git add backend/services
git commit -m "feat(metrics): internal :9101 /metrics listener + HTTP RED middleware in all services"
```

---

### Task 4: Domain metrics — mesh-worker (conversions + queue depth)

The worker is not a gRPC handler, so RED does not cover it. These are the highest-value domain metrics.

**Files:**
- Create: `backend/services/mesh-service/internal/worker/metrics.go`
- Modify: `backend/services/mesh-service/internal/worker/handle.go` (record around the process call)
- Modify: `backend/services/mesh-service/internal/worker/run.go` (record queue depth after each consume)

**Interfaces:**
- Consumes: `metrics.Registry` from Task 1.
- Produces (package-level in `worker`): `metricConversions *prometheus.CounterVec`, `metricConversionSeconds prometheus.Histogram`, `metricQueueDepth prometheus.Gauge`.

- [ ] **Step 1: Read the two call sites**

Run: `cd backend && sed -n '1,40p' services/mesh-service/internal/worker/handle.go services/mesh-service/internal/worker/run.go`
Note the exact function that performs a single job (call it `process`) and the loop that calls `ConsumeJobs`.

- [ ] **Step 2: Write `worker/metrics.go`**

```go
package worker

import "github.com/prometheus/client_golang/prometheus"
import "github.com/vbncursed/rosneft/backend/pkg/metrics"

var (
	metricConversions = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "mesh_conversions_total",
		Help: "Mesh conversions completed, by status (succeeded|failed).",
	}, []string{"status"})

	metricConversionSeconds = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "mesh_conversion_duration_seconds",
		Help:    "Wall-clock duration of a single mesh conversion.",
		Buckets: []float64{1, 5, 15, 30, 60, 120, 300, 600},
	})

	metricQueueDepth = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "mesh_queue_depth",
		Help: "Jobs delivered on the last consume batch (redis stream backlog signal).",
	})
)

func init() {
	metrics.Registry.MustRegister(metricConversions, metricConversionSeconds, metricQueueDepth)
}
```

- [ ] **Step 3: Instrument the process call in `handle.go`**

Wrap the single-job processing call (adjust the call expression to the real one found in Step 1):
```go
start := time.Now()
err := w.process(ctx, d) // <- the existing per-job call
metricConversionSeconds.Observe(time.Since(start).Seconds())
if err != nil {
	metricConversions.WithLabelValues("failed").Inc()
	// ...existing error log/handling stays...
} else {
	metricConversions.WithLabelValues("succeeded").Inc()
}
```
Add `"time"` to imports if absent.

- [ ] **Step 4: Record queue depth in `run.go`**

Right after the successful `ConsumeJobs` call:
```go
metricQueueDepth.Set(float64(len(jobs)))
```

- [ ] **Step 5: Build + commit**

Run: `cd backend && go build ./services/mesh-service/...`
Expected: PASS
```bash
git add backend/services/mesh-service
git commit -m "feat(metrics): mesh-worker conversion counters + queue-depth gauge"
```

---

### Task 5: Domain metrics — upload bytes + auth/twofa login outcomes

**Files:**
- Create: `backend/services/upload-service/internal/service/metrics.go`
- Modify: `backend/services/upload-service/internal/service/finalize.go` (add bytes/outcome recording)
- Create: `backend/services/auth-service/internal/service/auth/metrics.go`
- Modify: the auth password-login result site (locate in Step 1)
- Create: `backend/services/twofa-service/internal/service/metrics.go`
- Modify: the twofa verify result site (locate in Step 1)

**Interfaces:**
- Consumes: `metrics.Registry`.
- Produces: `metricUploadBytes prometheus.Counter`, `metricUploads *CounterVec` (upload); `metricLogins *CounterVec` (auth); `metricTwofaVerifications *CounterVec` (twofa).

- [ ] **Step 1: Locate the call sites**

Run:
```bash
cd backend
grep -rn "func (u \*Upload) Finalize" services/upload-service/internal/service/finalize.go
grep -rn "func .*Login\|VerifyPassword\|password" services/auth-service/internal/service/auth/*.go | grep -iv test | grep -iv passkey
grep -rn "func .*Verify" services/twofa-service/internal/service/*.go | grep -iv test
```
Note the function that returns the login/verify result and its success/failure branches.

- [ ] **Step 2: upload — `service/metrics.go`**

```go
package service

import "github.com/prometheus/client_golang/prometheus"
import "github.com/vbncursed/rosneft/backend/pkg/metrics"

var (
	metricUploadBytes = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "upload_bytes_total",
		Help: "Total bytes committed by finalized uploads.",
	})
	metricUploads = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "uploads_total",
		Help: "Uploads finalized, by status (succeeded|failed).",
	}, []string{"status"})
)

func init() { metrics.Registry.MustRegister(metricUploadBytes, metricUploads) }
```
In `finalize.go`, after the finalize produces `(blob, err)` (the returned `FinalizedBlob` carries the size — confirm field name, e.g. `blob.Size`):
```go
if err != nil {
	metricUploads.WithLabelValues("failed").Inc()
	return domain.FinalizedBlob{}, err
}
metricUploads.WithLabelValues("succeeded").Inc()
metricUploadBytes.Add(float64(blob.Size))
```

- [ ] **Step 3: auth — `service/auth/metrics.go`**

```go
package auth

import "github.com/prometheus/client_golang/prometheus"
import "github.com/vbncursed/rosneft/backend/pkg/metrics"

var metricLogins = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "auth_logins_total",
	Help: "Password login attempts, by status (succeeded|failed).",
}, []string{"status"})

func init() { metrics.Registry.MustRegister(metricLogins) }
```
At the password-login result branches found in Step 1:
```go
metricLogins.WithLabelValues("failed").Inc()    // wrong password / unknown user
metricLogins.WithLabelValues("succeeded").Inc() // on the success path
```

- [ ] **Step 4: twofa — `service/metrics.go`**

```go
package service

import "github.com/prometheus/client_golang/prometheus"
import "github.com/vbncursed/rosneft/backend/pkg/metrics"

var metricTwofaVerifications = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "twofa_verifications_total",
	Help: "TOTP verifications, by status (succeeded|failed).",
}, []string{"status"})

func init() { metrics.Registry.MustRegister(metricTwofaVerifications) }
```
At the verify result branches:
```go
metricTwofaVerifications.WithLabelValues("failed").Inc()
metricTwofaVerifications.WithLabelValues("succeeded").Inc()
```
> If the twofa service package name differs, match it (grep `^package` in the target file).

- [ ] **Step 5: Build + commit**

Run: `cd backend && go build ./... && go vet ./...`
Expected: PASS
```bash
git add backend/services/upload-service backend/services/auth-service backend/services/twofa-service
git commit -m "feat(metrics): domain metrics for uploads, logins, 2FA verifications"
```

---

## Phase 2 — Observability stack (Prometheus + Grafana in compose)

### Task 6: Prometheus service + scrape config

**Files:**
- Create: `ops/prometheus/prometheus.yml`
- Modify: `docker-compose.yml` (add `prometheus` service + `prometheus-data` volume)

- [ ] **Step 1: Write `ops/prometheus/prometheus.yml`**

```yaml
global:
  scrape_interval: 15s
  scrape_timeout: 10s

scrape_configs:
  - job_name: services
    static_configs:
      - targets:
          - gateway:9101
          - catalog:9101
          - auth:9101
          - twofa:9101
          - passkey:9101
          - content:9101
          - mesh-api:9101
          - mesh-worker:9101
          - asset:9101
          - upload:9101
        labels: { stack: andrey }
    relabel_configs:
      - source_labels: [__address__]
        regex: '([^:]+):.*'
        target_label: service
        replacement: '$1'
```

> mesh-worker has no `expose`d port today — Step 2 adds `expose: ["9101"]` to it and to every service so Prometheus can reach `:9101` in-network.

- [ ] **Step 2: Add the prometheus service + expose 9101 everywhere**

In `docker-compose.yml`, add `expose: ["9101"]` to each of the 10 services (merge with any existing `expose`). Then add:
```yaml
  prometheus:
    image: prom/prometheus:latest
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d
    volumes:
      - ./ops/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    expose:
      - "9090"
    depends_on:
      gateway: { condition: service_started }
```
Add to the `volumes:` block: `prometheus-data:`.

- [ ] **Step 3: Verify targets are up**

```bash
docker compose -p andrey up -d --build
sleep 20
docker compose -p andrey exec prometheus wget -qO- 'http://localhost:9090/api/v1/targets' | grep -o '"health":"[a-z]*"' | sort | uniq -c
```
Expected: 10 × `"health":"up"`. Investigate any `down` (usually a service missing `expose: 9101` or not started).

- [ ] **Step 4: Commit**

```bash
git add ops/prometheus/prometheus.yml docker-compose.yml
git commit -m "feat(metrics): Prometheus service scraping all 10 processes (unexposed)"
```

---

### Task 7: Grafana service + provisioning (datasource, auth.proxy, embedding)

**Files:**
- Create: `ops/grafana/provisioning/datasources/prometheus.yml`
- Create: `ops/grafana/provisioning/dashboards/provider.yml`
- Modify: `docker-compose.yml` (add `grafana` service + `grafana-data` volume; add `GRAFANA_URL` to `frontend`)

- [ ] **Step 1: Datasource provisioning**

`ops/grafana/provisioning/datasources/prometheus.yml`:
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

- [ ] **Step 2: Dashboard provider**

`ops/grafana/provisioning/dashboards/provider.yml`:
```yaml
apiVersion: 1
providers:
  - name: andrey
    orgId: 1
    folder: Andrey
    type: file
    disableDeletion: true
    allowUiUpdates: false
    options:
      path: /etc/grafana/dashboards
      foldersFromFilesStructure: false
```

- [ ] **Step 3: Grafana service in compose**

```yaml
  grafana:
    image: grafana/grafana:latest
    depends_on:
      prometheus: { condition: service_started }
    environment:
      # Served behind the Next BFF at /api/grafana/ — Grafana must know its
      # public sub-path so generated URLs resolve. Prod overrides the domain.
      GF_SERVER_ROOT_URL: "http://localhost:3000/api/grafana/"
      GF_SERVER_SERVE_FROM_SUB_PATH: "true"
      # Embedding: the site renders dashboards in an <iframe>.
      GF_SECURITY_ALLOW_EMBEDDING: "true"
      GF_SECURITY_COOKIE_SAMESITE: "lax"
      # auth.proxy: the BFF asserts the user via X-WEBAUTH-USER (only for Root).
      GF_AUTH_PROXY_ENABLED: "true"
      GF_AUTH_PROXY_HEADER_NAME: "X-WEBAUTH-USER"
      GF_AUTH_PROXY_HEADER_PROPERTY: "username"
      GF_AUTH_PROXY_AUTO_SIGN_UP: "true"
      GF_AUTH_PROXY_ENABLE_LOGIN_TOKEN: "false"
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_AUTH_DISABLE_LOGIN_FORM: "true"
      GF_AUTH_BASIC_ENABLED: "false"
      # Unified alerting (Task 9). Live/streaming off — dashboards poll.
      GF_UNIFIED_ALERTING_ENABLED: "true"
      GF_LIVE_MAX_CONNECTIONS: "0"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
      GF_USERS_DEFAULT_THEME: "dark"
    volumes:
      - ./ops/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./ops/grafana/dashboards:/etc/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    expose:
      - "3000"
```
Add `grafana-data:` to the `volumes:` block. Add to the `frontend` service `environment:`:
```yaml
      GRAFANA_URL: "http://grafana:3000"
```

- [ ] **Step 4: Boot + confirm Grafana is up (login form disabled)**

```bash
docker compose -p andrey up -d --build grafana
sleep 10
docker compose -p andrey exec grafana wget -qO- http://localhost:3000/api/health
```
Expected: JSON with `"database": "ok"`.

- [ ] **Step 5: Commit**

```bash
git add ops/grafana/provisioning docker-compose.yml
git commit -m "feat(metrics): Grafana service, datasource, auth.proxy + embedding (unexposed)"
```

---

### Task 8: Grafana dashboards (RED / Go runtime / Domain / Alerts)

Dashboards are provisioned JSON files with **fixed uids** (the iframe URLs depend on them). Author each in the running Grafana UI (Add panel → set the exact PromQL below), then **Export → Save to file** into `ops/grafana/dashboards/`, and set `"uid"` + `"title"` as specified. Titles/labels must say **Andrey**, never Rosneft.

**Files:**
- Create: `ops/grafana/dashboards/services-red.json` (uid `andrey-red`, title "Andrey — Services (RED)")
- Create: `ops/grafana/dashboards/go-runtime.json` (uid `andrey-runtime`, title "Andrey — Go Runtime")
- Create: `ops/grafana/dashboards/domain.json` (uid `andrey-domain`, title "Andrey — Domain")
- Create: `ops/grafana/dashboards/alerts.json` (uid `andrey-alerts`, title "Andrey — Alerts")

- [ ] **Step 1: Services RED dashboard (`andrey-red`)** — panels + queries:
  - **Request rate by service** (timeseries): `sum by (service) (rate(grpc_server_handled_total[5m]))` and `sum(rate(http_requests_total[5m]))`
  - **Error rate** (timeseries): `sum by (service) (rate(grpc_server_handled_total{grpc_code!="OK"}[5m]))` + `sum(rate(http_requests_total{code=~"5.."}[5m]))`
  - **p99 latency** (timeseries): `histogram_quantile(0.99, sum by (le, grpc_service) (rate(grpc_server_handling_seconds_bucket[5m])))`
  - **Up targets** (stat): `sum(up{job="services"})` of `count(up{job="services"})`

- [ ] **Step 2: Go runtime dashboard (`andrey-runtime`)** — panels:
  - **Resident memory** (timeseries): `process_resident_memory_bytes` by `service` (add `service` via the `instance`/relabel).
  - **Goroutines** (timeseries): `go_goroutines` by `service`.
  - **GC pause p99** (timeseries): `histogram_quantile(0.99, rate(go_gc_duration_seconds_bucket[5m]))`.
  - **Open FDs** (timeseries): `process_open_fds` by `service`.

- [ ] **Step 3: Domain dashboard (`andrey-domain`)** — panels:
  - **Conversions/min by status**: `sum by (status) (rate(mesh_conversions_total[5m])) * 60`
  - **Conversion p95 seconds**: `histogram_quantile(0.95, rate(mesh_conversion_duration_seconds_bucket[5m]))`
  - **Queue depth**: `mesh_queue_depth`
  - **Upload throughput (MB/s)**: `rate(upload_bytes_total[5m]) / 1024 / 1024`
  - **Login failures/min**: `rate(auth_logins_total{status="failed"}[5m]) * 60` and `rate(twofa_verifications_total{status="failed"}[5m]) * 60`

- [ ] **Step 4: Alerts dashboard (`andrey-alerts`)** — one **Alert list** panel:
  - Panel type `alertlist`, options: `alertInstanceLabelFilter: ""`, show `firing` + `pending`, group by `alertname`. This is the in-app view of Task 9's rules.

- [ ] **Step 5: Reload provisioning + verify uids resolve**

```bash
docker compose -p andrey restart grafana && sleep 8
for uid in andrey-red andrey-runtime andrey-domain andrey-alerts; do
  docker compose -p andrey exec grafana wget -qO- "http://grafana:3000/api/dashboards/uid/$uid" \
    -H "X-WEBAUTH-USER: admin" | grep -o "\"uid\":\"$uid\"" && echo "  ✓ $uid"
done
```
Expected: 4 × ✓.

- [ ] **Step 6: Commit**

```bash
git add ops/grafana/dashboards
git commit -m "feat(metrics): Grafana dashboards — RED, runtime, domain, alerts (uids fixed)"
```

---

### Task 9: Grafana unified alerting (extended rules, in-app / null receiver)

**Files:**
- Create: `ops/grafana/provisioning/alerting/rules.yml`
- Create: `ops/grafana/provisioning/alerting/contactpoints.yml`
- Create: `ops/grafana/provisioning/alerting/policies.yml`

**Interfaces:**
- Consumes: the `Prometheus` datasource (Task 7). Rules use `datasourceUid: prometheus` — set each datasource's uid explicitly in Task 7's datasource yml (`uid: prometheus`) so rules can reference it.

- [ ] **Step 1: Pin the datasource uid**

Edit `ops/grafana/provisioning/datasources/prometheus.yml`, add under the datasource: `uid: prometheus`.

- [ ] **Step 2: Null contact point (in-app only)**

`ops/grafana/provisioning/alerting/contactpoints.yml`:
```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: in-app
    receivers:
      - uid: in-app-null
        type: webhook
        disableResolveMessage: true
        settings:
          # No external delivery — firing alerts are viewed in the Alert list
          # panel on /admin/metrics. Points at Grafana's own health endpoint as
          # an inert sink. Swap this contact point to add Telegram/email later.
          url: http://localhost:3000/api/health
```

- [ ] **Step 3: Notification policy**

`ops/grafana/provisioning/alerting/policies.yml`:
```yaml
apiVersion: 1
policies:
  - orgId: 1
    receiver: in-app
    group_by: [alertname]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

- [ ] **Step 4: Rules** — `ops/grafana/provisioning/alerting/rules.yml`

Author the group with these rules (each is a Grafana-managed rule: `condition` on a reduced PromQL query via `datasourceUid: prometheus`). The eight rules and their expressions:

| Rule | Expr (fires when) | For |
|---|---|---|
| TargetDown | `up{job="services"} == 0` | 1m |
| HighGrpcErrorRate | `sum by (service)(rate(grpc_server_handled_total{grpc_code!="OK"}[5m])) / clamp_min(sum by (service)(rate(grpc_server_handled_total[5m])),0.001) > 0.05` | 5m |
| HighHttp5xxRate | `sum(rate(http_requests_total{code=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total[5m])),0.001) > 0.05` | 5m |
| HighLatencyP99 | `histogram_quantile(0.99, sum by (le,grpc_service)(rate(grpc_server_handling_seconds_bucket[5m]))) > 2` | 10m |
| ConversionFailures | `rate(mesh_conversions_total{status="failed"}[10m]) > 0` | 5m |
| MemoryGrowth | `process_resident_memory_bytes > 1.5e9` | 15m |
| QueueBacklog | `mesh_queue_depth > 50` | 10m |
| LoginFailureSpike | `rate(auth_logins_total{status="failed"}[5m]) * 60 > 30` | 5m |

Structure (fill the group with all eight; one shown in full, replicate the block per row swapping `title`/`expr`/`for`):
```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: andrey-core
    folder: Andrey
    interval: 1m
    rules:
      - uid: target-down
        title: TargetDown
        condition: C
        for: 1m
        data:
          - refId: A
            datasourceUid: prometheus
            model: { expr: 'up{job="services"} == 0', instant: true, refId: A }
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [0] }
              refId: C
        labels: { severity: critical }
        annotations: { summary: 'A service target is down' }
```

> Grafana-managed alert YAML is verbose; if hand-authoring is error-prone, create the rules in the UI (Alerting → New rule) with the exprs above, then **Export → Provisioning file (YAML)** into this path. Either route yields the same file.

- [ ] **Step 5: Reload + verify rules loaded**

```bash
docker compose -p andrey restart grafana && sleep 8
docker compose -p andrey exec grafana wget -qO- "http://grafana:3000/api/v1/provisioning/alert-rules" \
  -H "X-WEBAUTH-USER: admin" | grep -o '"title":"[A-Za-z]*"' | sort -u
```
Expected: the 8 rule titles.

- [ ] **Step 6: Fire-drill + commit**

```bash
docker compose -p andrey stop catalog && sleep 90
# TargetDown should be firing; view on /admin/metrics after Phase 3, or:
docker compose -p andrey exec grafana wget -qO- "http://grafana:3000/api/alertmanager/grafana/api/v2/alerts" -H "X-WEBAUTH-USER: admin" | grep -o '"alertname":"TargetDown"'
docker compose -p andrey start catalog
git add ops/grafana/provisioning/alerting ops/grafana/provisioning/datasources/prometheus.yml
git commit -m "feat(metrics): Grafana unified alerting — 8 extended rules, in-app receiver"
```

---

## Phase 3 — Frontend embed (Root-only)

### Task 10: BFF proxy `/api/grafana/[...path]` (cookie → isOwner → auth.proxy)

**Files:**
- Create: `frontend/src/app/api/grafana/[...path]/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser()` from `@/auth/application/current-user` (returns `Principal | null` with `isOwner`); env `GRAFANA_URL`; the `session` cookie.
- Produces: a same-origin proxy at `/api/grafana/*` that injects `X-WEBAUTH-USER` for owners and 403s everyone else.

- [ ] **Step 1: Write the route handler**

```ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/auth/application/current-user";

const GRAFANA = process.env.GRAFANA_URL ?? "http://grafana:3000";

// Response headers we must not copy verbatim (they describe the upstream hop).
const STRIP = new Set(["content-encoding", "content-length", "transfer-encoding"]);

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  // Gate: only Root may see any Grafana byte. The httpOnly `session` cookie is
  // sent by the browser on every same-origin iframe subresource request, so we
  // can authorize each one. ponytail: per-request getMe; add a short-TTL cache
  // keyed on the session token if this shows up in latency traces.
  const p = await getCurrentUser();
  if (!p?.isOwner) return new Response("forbidden", { status: 403 });

  const url = `${GRAFANA}/api/grafana/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("cookie"); // Grafana authenticates via the header, not cookies.
  headers.set("x-webauth-user", p.username);
  headers.set("host", "grafana:3000");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error duplex required when streaming a request body
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!STRIP.has(k.toLowerCase())) out.set(k, v);
  });
  return new Response(res.body, { status: res.status, headers: out });
}

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export {
  handler as GET, handler as POST, handler as PUT,
  handler as PATCH, handler as DELETE, handler as HEAD,
};
```

> `GF_SERVER_SERVE_FROM_SUB_PATH=true` + `GF_SERVER_ROOT_URL=.../api/grafana/` (Task 7) mean Grafana already emits URLs under `/api/grafana/`, so the upstream path is `/api/grafana/<path>` — no prefix rewriting needed.

- [ ] **Step 2: Verify gating**

```bash
cd frontend && GATEWAY_URL=http://localhost:8080 NEXT_PUBLIC_API_URL=http://localhost:8080 GRAFANA_URL=http://localhost:<grafana-host-port-if-any> yarn dev &
# No session cookie → 403:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/grafana/api/health   # expect 403
```
Expected: `403` without a Root session. (Full success path is exercised in Task 11's browser check.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/grafana
git commit -m "feat(metrics): Root-gated BFF proxy for Grafana (auth.proxy header inject)"
```

---

### Task 11: `/admin/metrics` page + sidebar link

**Files:**
- Create: `frontend/src/app/admin/metrics/page.tsx`
- Modify: `frontend/src/auth/presentation/console/console-sidebar.tsx` (add a Root-only "Metrics" link)
- Modify: `frontend/src/app/admin/layout.tsx:9` (pass a `showMetrics={p.isOwner}` prop, mirroring `showAccess`)

**Interfaces:**
- Consumes: `getCurrentUser()`, `redirect` from `next/navigation`, the four dashboard uids from Task 8 (`andrey-red`, `andrey-runtime`, `andrey-domain`, `andrey-alerts`).

- [ ] **Step 1: Write the page (Root gate + iframe)**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";

const DASHBOARDS = [
  { uid: "andrey-red", title: "Services (RED)" },
  { uid: "andrey-domain", title: "Domain" },
  { uid: "andrey-runtime", title: "Go Runtime" },
  { uid: "andrey-alerts", title: "Alerts" },
] as const;

export default async function MetricsPage() {
  const p = await getCurrentUser();
  if (!p?.isOwner) redirect("/");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold text-white">Метрики</h1>
      {DASHBOARDS.map((d) => (
        <section key={d.uid} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-white/70">{d.title}</h2>
          <iframe
            title={d.title}
            src={`/api/grafana/d/${d.uid}/_?kiosk&theme=dark`}
            className="h-[520px] w-full rounded-xl border border-white/10 bg-black/20"
          />
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the sidebar link**

Read `console-sidebar.tsx` first (`sed -n '1,80p'`). It already receives `showContent`/`showAccess` booleans and renders links. Add a `showMetrics?: boolean` prop and, guarded by it, a link:
```tsx
{showMetrics && <SidebarLink href="/admin/metrics" label="Метрики" />}
```
Match the existing link component/markup in that file (do not introduce a new pattern). Then in `admin/layout.tsx`, pass it:
```tsx
<ConsoleSidebar showContent={showContent} showAccess={p.isOwner} showMetrics={p.isOwner} />
```

- [ ] **Step 3: Lint + build**

Run: `cd frontend && yarn lint && yarn build`
Expected: 0 errors, build success. (Both new files are well under the 200-line cap.)

- [ ] **Step 4: Browser E2E (Root sees dashboards, non-owner redirected)**

Bring the full stack up (`docker compose -p andrey up -d --build`). Log in as Root, navigate to `/admin/metrics`, confirm all four iframes render Grafana panels (not a login form, not 403). Log in as a non-owner and confirm `/admin/metrics` redirects to `/` and `/api/grafana/api/health` returns 403. Use the headless-Chrome/CDP approach from the [[browser-e2e-without-playwright]] memory.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/metrics frontend/src/auth/presentation/console/console-sidebar.tsx frontend/src/app/admin/layout.tsx
git commit -m "feat(metrics): Root-only /admin/metrics page with embedded Grafana dashboards"
```

---

## Deployment (after all tasks merge to main)

- [ ] Prod override must set Grafana's public URL. In the prod compose override, set on `grafana`:
  `GF_SERVER_ROOT_URL: "https://andrey.vbncursed.fun/api/grafana/"`. Keep `grafana`/`prometheus` unexposed (no host `ports`).
- [ ] On the prod host (`/opt/rosneft`): `git pull`, then `docker compose -p andrey up -d --build`. New `prometheus-data`/`grafana-data` volumes initialise fresh; no migration.
- [ ] Verify: `curl -s -o /dev/null -w "%{http_code}\n" https://andrey.vbncursed.fun/admin/metrics` (302→/login when anonymous), and confirm a Root session renders dashboards.

---

## Notes for the executor

- **Backend go-skills:** before writing Go in Phase 1, read `~/.claude/plugins/cache/samber/cc-skills-golang/1.7.0/skills/golang-observability/SKILL.md` (owns metrics patterns) and `.../golang-concurrency/SKILL.md` (the `:9101` listener goroutine + graceful shutdown). They are not Skill-invocable this session — read the files directly.
- **Per-service confirmation:** Task 3 lists serve files by convention; always `ls` the service's `internal/bootstrap/` and grep for the `Serve`/`ListenAndServe` call before editing — a couple of services may name the file differently.
- **Field-name confirmation:** Task 5 references `blob.Size`, and the auth/twofa result branches — confirm the exact identifiers at the call sites (grep in Step 1 of each task) before writing the increment lines.
