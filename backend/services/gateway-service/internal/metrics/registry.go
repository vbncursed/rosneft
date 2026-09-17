// Package metrics resolves dashboard panel IDs to their PromQL and queries
// Prometheus. The PromQL registry lives here, server-side only, so the SPA
// bundle never carries query expressions: the client sends a panel ID keyed to
// the same registry (see the frontend panel-catalog), this package resolves it.
package metrics

// panel is a server-side query definition: the PromQL and whether it is an
// instant (single-value) query rather than a range query.
type panel struct {
	expr    string
	instant bool
}

// panels maps dashboard panel IDs to their PromQL. IDs are mirrored by the
// client's panel-catalog (title/unit live there); expr lives only here.
var panels = map[string]panel{
	// Stat tiles — instant snapshots.
	"stat-up":     {expr: `sum(up{job="services"})`, instant: true},
	"stat-rps":    {expr: `sum(rate(http_requests_total[5m])) or vector(0)`, instant: true},
	"stat-errors": {expr: `(sum(rate(http_requests_total{code=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(http_requests_total[5m])),0.001)`, instant: true},
	"stat-p99":    {expr: `histogram_quantile(0.99, sum by (le)(rate(grpc_server_handling_seconds_bucket[5m])))`, instant: true},
	"stat-queue":  {expr: `max(mesh_queue_depth)`, instant: true},
	// One row per scraped service, 1 or 0 — the only reading that can say
	// "down". Named by the `service` label the scrape config relabels onto
	// every target (ops/prometheus/prometheus.yml).
	"services-up": {expr: `up{job="services"}`, instant: true},

	// Services (RED).
	"red-rate":    {expr: `sum by (service)(rate(grpc_server_handled_total[5m]))`},
	"red-errors":  {expr: `sum by (service)(rate(grpc_server_handled_total{grpc_code!="OK"}[5m]))`},
	"red-latency": {expr: `histogram_quantile(0.99, sum by (le, grpc_service)(rate(grpc_server_handling_seconds_bucket[5m])))`},
	"red-http":    {expr: `sum(rate(http_requests_total[5m]))`},

	// Domain.
	"domain-conversions":    {expr: `sum by (status)(rate(mesh_conversions_total[5m])) * 60`},
	"domain-conversion-p95": {expr: `histogram_quantile(0.95, sum by (le)(rate(mesh_conversion_duration_seconds_bucket[10m])))`},
	"domain-queue":          {expr: `mesh_queue_depth`},
	"domain-upload":         {expr: `sum(rate(upload_bytes_total[5m])) / 1048576`},
	"domain-auth":           {expr: `sum by (status)(rate(auth_logins_total[5m])) * 60`},
	"domain-twofa":          {expr: `sum by (status)(rate(twofa_verifications_total[5m])) * 60`},

	// Go runtime.
	"runtime-memory":     {expr: `process_resident_memory_bytes`},
	"runtime-goroutines": {expr: `go_goroutines`},
	"runtime-gc":         {expr: `max by (service)(go_gc_duration_seconds{quantile="1.0"})`},
	"runtime-fds":        {expr: `process_open_fds`},

	// Alerts — ALERTS exists only while a rule is active.
	"alerts": {expr: `ALERTS{alertstate=~"firing|pending"}`, instant: true},
}

// lookup resolves a panel ID to its query definition.
func lookup(id string) (panel, bool) {
	p, ok := panels[id]
	return p, ok
}
