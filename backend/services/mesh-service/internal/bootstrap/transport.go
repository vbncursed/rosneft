package bootstrap

import (
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	grpctransport "github.com/vbncursed/rosneft/backend/services/mesh-service/internal/transport/grpcapi"
)

// Compile-time assertion: service.Mesh satisfies the gRPC transport contract.
var _ grpctransport.Service = (*service.Mesh)(nil)

// InitGRPCServer wires the mesh handler, the gRPC health probe (SERVING),
// and reflection onto a fresh *grpc.Server. The caller drives Serve / Stop.
func InitGRPCServer(svc *service.Mesh) (*grpc.Server, *health.Server) {
	srv := grpc.NewServer()
	grpctransport.New(svc).Register(srv)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus(meshv1.MeshService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	reflection.Register(srv)
	return srv, healthSrv
}
