package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"os/signal"
	"syscall"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/config"
)

// RunServe is the full lifecycle of `passkey serve`.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("passkey: starting", "grpc_addr", cfg.GRPCAddr)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.AutoMigrate {
		logger.Info("passkey: applying migrations")
		if err := RunMigrateUp(rootCtx, cfg); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
	}

	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	rdb, err := InitRedis(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	handler, err := InitService(pool, rdb, cfg)
	if err != nil {
		return err
	}

	grpcSrv, healthSrv := InitGRPCServer( //nolint:contextcheck // false positive: the recovery stream interceptor takes its context from the stream (ss.Context()) per request, not from this bootstrap ctx
		handler,
		logger,
	)

	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "passkey",
		Health:  healthSrv,
		Names:   []string{"", passkeyv1.PasskeyService_ServiceDesc.ServiceName},
		Probe: func(ctx context.Context) error {
			return errors.Join(pool.Ping(ctx), rdb.Ping(ctx).Err())
		},
		Logger: logger,
	})

	return grpcutil.Serve(rootCtx, grpcutil.ServeConfig{
		Service:         "passkey",
		Addr:            cfg.GRPCAddr,
		MetricsAddr:     cfg.MetricsAddr,
		ShutdownTimeout: cfg.ShutdownTimeout,
		Server:          grpcSrv,
		Health:          healthSrv,
		HealthName:      passkeyv1.PasskeyService_ServiceDesc.ServiceName,
		Logger:          logger,
	})
}
