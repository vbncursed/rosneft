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
