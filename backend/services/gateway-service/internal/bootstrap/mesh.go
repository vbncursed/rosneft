package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/mesh"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// Compile-time assertion: mesh client satisfies the service-layer contract.
var _ service.Mesh = (*mesh.Client)(nil)

// InitMesh dials the mesh gRPC service. The caller must Close the client.
func InitMesh(cfg config.Config) (*mesh.Client, error) {
	return mesh.Dial(cfg.MeshGRPCAddr)
}
