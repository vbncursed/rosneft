package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/config"
)

// RunServe is the full lifecycle of `catalog serve`: migrations → pool →
// service → gRPC server → listen → graceful shutdown.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("catalog: starting", "grpc_addr", cfg.GRPCAddr)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.AutoMigrate {
		logger.Info("catalog: applying migrations")
		if err := RunMigrateUp(rootCtx, cfg); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
	}

	pool, err := InitPostgres(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	svc := InitService(InitStorage(pool))

	grpcSrv, healthSrv := InitGRPCServer(svc)

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.GRPCAddr, err)
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- grpcSrv.Serve(lis) }()
	logger.Info("catalog: serving gRPC", "addr", lis.Addr().String())

	select {
	case <-rootCtx.Done():
		logger.Info("catalog: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			return fmt.Errorf("grpc serve: %w", err)
		}
	}

	healthSrv.SetServingStatus(catalogv1.CatalogService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_NOT_SERVING)

	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	stopped := make(chan struct{})
	go func() { grpcSrv.GracefulStop(); close(stopped) }()
	select {
	case <-stopped:
		logger.Info("catalog: graceful shutdown complete")
	case <-stopCtx.Done():
		logger.Warn("catalog: shutdown timeout, forcing stop")
		grpcSrv.Stop()
	}
	return nil
}
