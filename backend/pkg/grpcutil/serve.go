package grpcutil

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

// ServeConfig is everything the shared tail of a service's `serve` needs.
type ServeConfig struct {
	Service         string // log prefix, e.g. "catalog"
	Addr            string // gRPC listen address
	MetricsAddr     string
	ShutdownTimeout time.Duration // GracefulStop budget before a forced Stop
	Server          *grpc.Server
	Health          *health.Server
	HealthName      string // the ServiceDesc name flipped to NOT_SERVING on shutdown
	Logger          *slog.Logger
}

// Serve listens on cfg.Addr, serves gRPC and the metrics endpoint, and blocks
// until ctx is done or the server fails. It then marks cfg.HealthName
// NOT_SERVING and drains in-flight RPCs, forcing a stop after
// cfg.ShutdownTimeout. A clean shutdown returns nil.
func Serve(ctx context.Context, cfg ServeConfig) error {
	lis, err := (&net.ListenConfig{}).Listen(ctx, "tcp", cfg.Addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.Addr, err)
	}
	return serveOn(ctx, lis, cfg)
}

func serveOn(ctx context.Context, lis net.Listener, cfg ServeConfig) error {
	serveErr := make(chan error, 1)
	go serveMetrics(cfg)
	cfg.Logger.Info("metrics: serving", "addr", cfg.MetricsAddr)
	go func() { serveErr <- cfg.Server.Serve(lis) }()
	cfg.Logger.Info(cfg.Service+": serving gRPC", "addr", lis.Addr().String())

	select {
	case <-ctx.Done():
		cfg.Logger.Info(cfg.Service + ": shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			return fmt.Errorf("grpc serve: %w", err)
		}
	}

	cfg.Health.SetServingStatus(cfg.HealthName, healthpb.HealthCheckResponse_NOT_SERVING)
	stopWithTimeout(ctx, cfg)
	return nil
}

func serveMetrics(cfg ServeConfig) {
	if err := metrics.Serve(cfg.MetricsAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
		cfg.Logger.Error("metrics: listener failed", "err", err)
	}
}

// stopWithTimeout outlives ctx on purpose: ctx is already cancelled on the
// signal path, and the drain still needs its full budget.
func stopWithTimeout(ctx context.Context, cfg ServeConfig) {
	stopCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), cfg.ShutdownTimeout)
	defer cancel()
	stopped := make(chan struct{})
	go func() { cfg.Server.GracefulStop(); close(stopped) }()
	select {
	case <-stopped:
		cfg.Logger.Info(cfg.Service + ": graceful shutdown complete")
	case <-stopCtx.Done():
		cfg.Logger.Warn(cfg.Service + ": shutdown timeout, forcing stop")
		cfg.Server.Stop()
	}
}
