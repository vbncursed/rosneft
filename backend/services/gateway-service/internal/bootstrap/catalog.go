package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/catalog"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// Compile-time assertion: catalog client satisfies the service-layer contract.
var _ service.Catalog = (*catalog.Client)(nil)

// InitCatalog dials the catalog gRPC service. The caller must Close the client.
func InitCatalog(cfg config.Config) (*catalog.Client, error) {
	return catalog.Dial(cfg.CatalogGRPCAddr)
}
