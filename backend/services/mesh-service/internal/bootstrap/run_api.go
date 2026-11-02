package bootstrap

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
)

// RunAPI is the full lifecycle of `mesh-api`: redis → storage → service →
// gRPC server → listen → graceful shutdown on SIGINT/SIGTERM.
func RunAPI(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("mesh-api: starting", "grpc_addr", cfg.GRPCAddr, "redis_addr", cfg.RedisAddr)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	rdb, err := InitRedis(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	store, err := InitStorage(rootCtx, rdb)
	if err != nil {
		return fmt.Errorf("init storage: %w", err)
	}

	svc := InitServiceAPI(store)
	grpcSrv, healthSrv := InitGRPCServer( //nolint:contextcheck // false positive: the recovery stream interceptor takes its context from the stream (ss.Context()) per request, not from this bootstrap ctx
		svc,
		logger,
	)

	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "mesh-api",
		Health:  healthSrv,
		Names:   []string{"", meshv1.MeshService_ServiceDesc.ServiceName},
		Probe:   func(ctx context.Context) error { return rdb.Ping(ctx).Err() },
		Logger:  logger,
	})

	return grpcutil.Serve(rootCtx, grpcutil.ServeConfig{
		Service:         "mesh-api",
		Addr:            cfg.GRPCAddr,
		MetricsAddr:     cfg.MetricsAddr,
		ShutdownTimeout: cfg.ShutdownTimeout,
		Server:          grpcSrv,
		Health:          healthSrv,
		HealthName:      meshv1.MeshService_ServiceDesc.ServiceName,
		Logger:          logger,
	})
}
