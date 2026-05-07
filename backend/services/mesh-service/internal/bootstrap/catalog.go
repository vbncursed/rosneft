package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/catalog"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

// Compile-time assertion: the catalog client satisfies the service-layer
// catalog contract.
var _ service.Catalog = (*catalog.Client)(nil)

// InitCatalog dials the catalog service. The caller must Close the client.
func InitCatalog(cfg config.Config) (*catalog.Client, error) {
	return catalog.Dial(cfg.CatalogGRPCAddr)
}
