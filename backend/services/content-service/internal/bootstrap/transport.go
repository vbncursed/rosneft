package bootstrap

import (
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

// InitGRPCServer builds the gRPC server with the standard backend interceptors,
// the ContentService handler, the health probe (SERVING), and reflection.
func InitGRPCServer(handler *grpcapi.Server, logger *slog.Logger) (*grpc.Server, *health.Server) {
	srv := grpcutil.NewServer(logger)
	handler.Register(srv)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus(contentv1.ContentService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	reflection.Register(srv)
	return srv, healthSrv
}
