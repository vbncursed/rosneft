package bootstrap

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
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

	// Attach capture triggers to whatever audited tables exist right now, and
	// only now: a table catalog/auth/content create after this boot is skipped
	// and stays unjournaled until this service is recreated (with an image
	// carrying the audit migration that registers it) or restarted.
	attached, err := store.EnsureTriggers(rootCtx)
	if err != nil {
		return fmt.Errorf("ensure audit triggers: %w", err)
	}
	logger.Info("audit: capture triggers ensured", "attached", attached)

	go RunCheckpointer(rootCtx, svc, witness, cfg.CheckpointInterval, logger)

	grpcSrv, healthSrv := InitGRPCServer( //nolint:contextcheck // false positive: the recovery stream interceptor takes its context from the stream (ss.Context()) per request, not from this bootstrap ctx
		handler,
		logger,
	)

	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "audit",
		Health:  healthSrv,
		Names:   []string{"", auditv1.AuditService_ServiceDesc.ServiceName},
		Probe:   func(ctx context.Context) error { return pool.Ping(ctx) },
		Logger:  logger,
	})

	return grpcutil.Serve(rootCtx, grpcutil.ServeConfig{
		Service:         "audit",
		Addr:            cfg.GRPCAddr,
		MetricsAddr:     cfg.MetricsAddr,
		ShutdownTimeout: cfg.ShutdownTimeout,
		Server:          grpcSrv,
		Health:          healthSrv,
		HealthName:      auditv1.AuditService_ServiceDesc.ServiceName,
		Logger:          logger,
	})
}
