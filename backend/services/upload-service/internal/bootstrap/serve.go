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
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"github.com/vbncursed/rosneft/backend/pkg/metrics"
	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/config"
	grpctransport "github.com/vbncursed/rosneft/backend/services/upload-service/internal/transport/grpcapi"
)

// RunServe is the full lifecycle of `upload serve`: storage init → service →
// gRPC server → graceful shutdown.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("upload: starting", "grpc_addr", cfg.GRPCAddr, "blob_dir", cfg.BlobDir, "incoming_dir", cfg.IncomingDir)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := InitSessionStore(cfg)
	if err != nil {
		return err
	}
	blobs, err := InitBlobs(cfg)
	if err != nil {
		return err
	}
	svc := InitService(cfg, store, blobs)

	grpcSrv := grpcutil.NewServer(logger)
	grpctransport.New(svc).Register(grpcSrv)

	healthSrv := health.NewServer()
	healthpb.RegisterHealthServer(grpcSrv, healthSrv)
	healthSrv.SetServingStatus(uploadv1.UploadService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)

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
	logger.Info("upload: serving gRPC", "addr", lis.Addr().String())

	select {
	case <-rootCtx.Done():
		logger.Info("upload: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			return fmt.Errorf("grpc serve: %w", err)
		}
	}

	healthSrv.SetServingStatus(uploadv1.UploadService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_NOT_SERVING)

	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	stopped := make(chan struct{})
	go func() { grpcSrv.GracefulStop(); close(stopped) }()
	select {
	case <-stopped:
		logger.Info("upload: graceful shutdown complete")
	case <-stopCtx.Done():
		logger.Warn("upload: shutdown timeout, forcing stop")
		grpcSrv.Stop()
	}
	return nil
}
