// Package healthz provides /healthz (liveness) and /readyz (readiness) HTTP
// handlers with named, concurrently evaluated probes.
//
// Liveness reports whether the process is alive (used by orchestrators to
// decide whether to restart the container). Readiness reports whether the
// process can serve traffic (used to gate load-balancer registration and
// graceful-shutdown drain windows).
package healthz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// Probe reports the health of a dependency. It MUST respect ctx cancellation
// so /readyz cannot hang indefinitely on a slow downstream.
type Probe func(ctx context.Context) error

// Config configures Handler.
type Config struct {
	Service string        // service name reported in JSON output
	Version string        // build version reported in JSON output
	Timeout time.Duration // per-probe deadline; defaults to 2s when <= 0
}

// Handler exposes liveness and readiness HTTP endpoints.
type Handler struct {
	service string
	version string
	timeout time.Duration

	ready atomic.Bool

	mu     sync.RWMutex
	probes map[string]Probe
}

// New creates a Handler. Call MarkReady once startup is complete.
func New(cfg Config) *Handler {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 2 * time.Second
	}
	return &Handler{
		service: cfg.Service,
		version: cfg.Version,
		timeout: cfg.Timeout,
		probes:  make(map[string]Probe),
	}
}

// Register adds a readiness probe under name. Safe to call after Mount.
func (h *Handler) Register(name string, p Probe) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.probes[name] = p
}

// MarkReady flips the readiness flag to ready. Call after all dependencies
// have been initialized.
func (h *Handler) MarkReady() { h.ready.Store(true) }

// MarkNotReady flips the readiness flag back to not-ready. Useful during
// graceful-shutdown drain windows so load balancers stop sending new traffic.
func (h *Handler) MarkNotReady() { h.ready.Store(false) }

// Mount registers GET /healthz and GET /readyz on mux.
func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.Live)
	mux.HandleFunc("GET /readyz", h.Ready)
}

// Live is the liveness handler — exported so routers without a
// *http.ServeMux contract (chi, gorilla, …) can register it directly.
func (h *Handler) Live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": h.service,
		"version": h.version,
	})
}

// Ready is the readiness handler — exported alongside Live for routers
// without a *http.ServeMux contract.
func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	if !h.ready.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status":  "not_ready",
			"service": h.service,
		})
		return
	}

	probes := h.snapshotProbes()
	if len(probes) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": h.service,
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.timeout)
	defer cancel()

	errs := evalProbes(ctx, probes)
	status := http.StatusOK
	statusText := "ok"
	results := make(map[string]string, len(errs))
	for name, err := range errs {
		if err != nil {
			results[name] = err.Error()
			status = http.StatusServiceUnavailable
			statusText = "degraded"
		} else {
			results[name] = "ok"
		}
	}
	writeJSON(w, status, map[string]any{
		"status":  statusText,
		"service": h.service,
		"checks":  results,
	})
}

// CheckAll runs every registered probe concurrently under ctx — the same
// evaluation Ready performs — and joins the failures into one error, or
// returns nil when every probe passes (including when none are registered).
//
// It exists for long-running readiness watchers such as
// grpcutil.WatchReadiness, which publish the service_ready gauge on a timer
// rather than writing an HTTP response: they can hand this method straight
// to ReadinessConfig.Probe instead of duplicating the probe list a service
// already registered here.
func (h *Handler) CheckAll(ctx context.Context) error {
	errs := evalProbes(ctx, h.snapshotProbes())
	var joined []error
	for name, err := range errs {
		if err != nil {
			joined = append(joined, fmt.Errorf("%s: %w", name, err))
		}
	}
	return errors.Join(joined...)
}

func (h *Handler) snapshotProbes() map[string]Probe {
	h.mu.RLock()
	defer h.mu.RUnlock()
	probes := make(map[string]Probe, len(h.probes))
	maps.Copy(probes, h.probes)
	return probes
}

// evalProbes runs every probe concurrently under ctx and returns each
// probe's error keyed by name (nil means it passed).
func evalProbes(ctx context.Context, probes map[string]Probe) map[string]error {
	var (
		mu      sync.Mutex
		results = make(map[string]error, len(probes))
		wg      sync.WaitGroup
	)
	for name, probe := range probes {
		wg.Go(func() {
			err := probe(ctx)
			mu.Lock()
			defer mu.Unlock()
			results[name] = err
		})
	}
	wg.Wait()
	return results
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
