package bootstrap

import (
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/transport/grpcapi"
)

// InitGRPCServer builds the gRPC server with the standard backend interceptors,
// the AuditService handler, the health probe (SERVING), and reflection.
func InitGRPCServer(handler *grpcapi.Server, logger *slog.Logger) (*grpc.Server, *health.Server) {
	srv := grpcutil.NewServer(logger)
	handler.Register(srv)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus(auditv1.AuditService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	reflection.Register(srv)
	return srv, healthSrv
}
