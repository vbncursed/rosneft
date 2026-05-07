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
	defer rdb.Close()

	store, err := InitStorage(rootCtx, rdb)
	if err != nil {
		return fmt.Errorf("init storage: %w", err)
	}

	svc := InitServiceAPI(store)
	grpcSrv, healthSrv := InitGRPCServer(svc, logger)

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", cfg.GRPCAddr, err)
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- grpcSrv.Serve(lis) }()
	logger.Info("mesh-api: serving gRPC", "addr", lis.Addr().String())

	select {
	case <-rootCtx.Done():
		logger.Info("mesh-api: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			return fmt.Errorf("grpc serve: %w", err)
		}
	}

	healthSrv.SetServingStatus(meshv1.MeshService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_NOT_SERVING)

	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	stopped := make(chan struct{})
	go func() { grpcSrv.GracefulStop(); close(stopped) }()
	select {
	case <-stopped:
		logger.Info("mesh-api: graceful shutdown complete")
	case <-stopCtx.Done():
		logger.Warn("mesh-api: shutdown timeout, forcing stop")
		grpcSrv.Stop()
	}
	return nil
}
