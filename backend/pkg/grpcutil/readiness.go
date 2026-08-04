package grpcutil

import (
	"context"
	"log/slog"
	"time"

	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

// defaultReadinessInterval is deliberately shorter than the 30s Prometheus
// rule interval, so a flip is visible on the next scrape rather than the one
// after it.
const defaultReadinessInterval = 10 * time.Second

// ReadinessConfig configures WatchReadiness.
type ReadinessConfig struct {
	Service  string         // metric label, e.g. "catalog"
	Health   *health.Server // optional: nil for processes with no gRPC server
	Names    []string       // gRPC service names to flip; include "" for the whole server
	Interval time.Duration  // defaults to 10s when <= 0
	Probe    func(context.Context) error
	Logger   *slog.Logger // optional
}

// WatchReadiness probes cfg.Probe on a ticker, publishes the result as the
// service_ready gauge, and — when cfg.Health is set — flips the gRPC health
// status for every name in cfg.Names.
//
// It blocks until ctx is done; run it in a goroutine. The first probe runs
// immediately rather than after one interval, so a service that boots with a
// dead dependency reports it at once instead of looking ready for 10 seconds.
func WatchReadiness(ctx context.Context, cfg ReadinessConfig) {
	if cfg.Interval <= 0 {
		cfg.Interval = defaultReadinessInterval
	}

	last := true
	check := func() {
		probeCtx, cancel := context.WithTimeout(ctx, cfg.Interval)
		err := cfg.Probe(probeCtx)
		cancel()

		ready := err == nil
		metrics.SetReady(cfg.Service, ready)
		if ready == last {
			return
		}
		last = ready
		if cfg.Logger != nil {
			cfg.Logger.Warn("readiness changed", "service", cfg.Service, "ready", ready, "err", err)
		}
		if cfg.Health == nil {
			return
		}
		status := healthpb.HealthCheckResponse_NOT_SERVING
		if ready {
			status = healthpb.HealthCheckResponse_SERVING
		}
		for _, n := range cfg.Names {
			cfg.Health.SetServingStatus(n, status)
		}
	}

	check()
	t := time.NewTicker(cfg.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			check()
		}
	}
}
