package bootstrap

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

// RunServe is the full lifecycle of `content serve`.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("content: starting", "grpc_addr", cfg.GRPCAddr)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.AutoMigrate {
		logger.Info("content: applying migrations")
		if err := RunMigrateUp(rootCtx, cfg); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
	}

	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	blobs, err := InitBlobStore(cfg)
	if err != nil {
		return fmt.Errorf("blob store: %w", err)
	}
	content := InitService(pool, blobs)
	grpcSrv, healthSrv := InitGRPCServer( //nolint:contextcheck // false positive: the recovery stream interceptor takes its context from the stream (ss.Context()) per request, not from this bootstrap ctx
		grpcapi.New(content),
		logger,
	)
	// Rows older than the thumbnail column, and any whose create-time
	// thumbnail failed. One at a time, for as long as the process lives.
	go content.BackfillThumbnails(rootCtx)

	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "content",
		Health:  healthSrv,
		Names:   []string{"", contentv1.ContentService_ServiceDesc.ServiceName},
		Probe:   func(ctx context.Context) error { return pool.Ping(ctx) },
		Logger:  logger,
	})

	return grpcutil.Serve(rootCtx, grpcutil.ServeConfig{
		Service:         "content",
		Addr:            cfg.GRPCAddr,
		MetricsAddr:     cfg.MetricsAddr,
		ShutdownTimeout: cfg.ShutdownTimeout,
		Server:          grpcSrv,
		Health:          healthSrv,
		HealthName:      contentv1.ContentService_ServiceDesc.ServiceName,
		Logger:          logger,
	})
}
