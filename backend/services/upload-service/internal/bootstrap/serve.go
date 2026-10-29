package bootstrap

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
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

	grpcSrv := grpcutil.NewServer( //nolint:contextcheck // false positive: the recovery stream interceptor takes its context from the stream (ss.Context()) per request, not from this bootstrap ctx
		logger,
	)
	grpctransport.New(svc).Register(grpcSrv)

	healthSrv := health.NewServer()
	healthpb.RegisterHealthServer(grpcSrv, healthSrv)
	healthSrv.SetServingStatus(uploadv1.UploadService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)

	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "upload",
		Health:  healthSrv,
		Names:   []string{"", uploadv1.UploadService_ServiceDesc.ServiceName},
		Probe:   func(context.Context) error { _, err := os.Stat(cfg.BlobDir); return err },
		Logger:  logger,
	})

	return grpcutil.Serve(rootCtx, grpcutil.ServeConfig{
		Service:         "upload",
		Addr:            cfg.GRPCAddr,
		MetricsAddr:     cfg.MetricsAddr,
		ShutdownTimeout: cfg.ShutdownTimeout,
		Server:          grpcSrv,
		Health:          healthSrv,
		HealthName:      uploadv1.UploadService_ServiceDesc.ServiceName,
		Logger:          logger,
	})
}
