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
	mux.HandleFunc("GET /healthz", h.live)
	mux.HandleFunc("GET /readyz", h.readyHandler)
}

func (h *Handler) live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": h.service,
		"version": h.version,
	})
}

func (h *Handler) readyHandler(w http.ResponseWriter, r *http.Request) {
	if !h.ready.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status":  "not_ready",
			"service": h.service,
		})
		return
	}

	h.mu.RLock()
	probes := make(map[string]Probe, len(h.probes))
	maps.Copy(probes, h.probes)
	h.mu.RUnlock()

	if len(probes) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": h.service,
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.timeout)
	defer cancel()

	var (
		mu      sync.Mutex
		results = make(map[string]string, len(probes))
		failed  bool
		wg      sync.WaitGroup
	)
	for name, probe := range probes {
		wg.Go(func() {
			err := probe(ctx)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				results[name] = err.Error()
				failed = true
			} else {
				results[name] = "ok"
			}
		})
	}
	wg.Wait()

	status := http.StatusOK
	statusText := "ok"
	if failed {
		status = http.StatusServiceUnavailable
		statusText = "degraded"
	}
	writeJSON(w, status, map[string]any{
		"status":  statusText,
		"service": h.service,
		"checks":  results,
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
