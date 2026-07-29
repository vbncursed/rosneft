package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
)

// RunServe is the full lifecycle of `audit serve`: migrations → pool →
// service → trigger attachment → gRPC server → listen → graceful shutdown.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("audit: starting", "grpc_addr", cfg.GRPCAddr)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.AutoMigrate {
		logger.Info("audit: applying migrations")
		if err := RunMigrateUp(rootCtx, cfg); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
	}

	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	handler, store, svc := InitService(pool)

	witness, err := digest.Open(cfg.DigestFile)
	if err != nil {
		return fmt.Errorf("open digest witness: %w", err)
	}
	defer func() { _ = witness.Close() }()

	// Attach capture triggers to whatever audited tables exist right now.
	// Ordering-free by design: tables catalog/auth/content have not migrated
	// yet are skipped and picked up on a later boot, so this service never
	// needs to be sequenced against the others.
	attached, err := store.EnsureTriggers(rootCtx)
	if err != nil {
		return fmt.Errorf("ensure audit triggers: %w", err)
	}
	logger.Info("audit: capture triggers ensured", "attached", attached)

	go RunCheckpointer(rootCtx, svc, witness, cfg.CheckpointInterval, logger)

	grpcSrv, healthSrv := InitGRPCServer(handler, logger)

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.GRPCAddr, err)
	}

	serveErr := make(chan error, 1)
	go func() {
		if err := metrics.Serve(cfg.MetricsAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("metrics: listener failed", "err", err)
		}
	}()
	logger.Info("metrics: serving", "addr", cfg.MetricsAddr)
	go func() { serveErr <- grpcSrv.Serve(lis) }()
	logger.Info("audit: serving gRPC", "addr", lis.Addr().String())

	select {
	case <-rootCtx.Done():
		logger.Info("audit: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			return fmt.Errorf("grpc serve: %w", err)
		}
	}

	healthSrv.SetServingStatus(auditv1.AuditService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_NOT_SERVING)
	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	stopped := make(chan struct{})
	go func() { grpcSrv.GracefulStop(); close(stopped) }()
	select {
	case <-stopped:
		logger.Info("audit: graceful shutdown complete")
	case <-stopCtx.Done():
		logger.Warn("audit: shutdown timeout, forcing stop")
		grpcSrv.Stop()
	}
	return nil
}
