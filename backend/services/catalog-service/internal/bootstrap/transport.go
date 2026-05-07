package bootstrap

import (
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	grpctransport "github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
)

// Compile-time assertion: the service satisfies the transport contract.
var _ grpctransport.Service = (*service.Catalog)(nil)

// InitGRPCServer wires the catalog handler, the gRPC health probe (SERVING),
// and reflection onto a fresh *grpc.Server. The caller drives Serve / Stop.
// The server is constructed via grpcutil so it inherits the standard backend
// keepalive parameters, message size limits, and recovery / slog / request-id
// interceptors.
func InitGRPCServer(svc *service.Catalog, logger *slog.Logger) (*grpc.Server, *health.Server) {
	srv := grpcutil.NewServer(logger)
	grpctransport.New(svc).Register(srv)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus(catalogv1.CatalogService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	reflection.Register(srv)
	return srv, healthSrv
}
