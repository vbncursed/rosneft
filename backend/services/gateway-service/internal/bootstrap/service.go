package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/catalog"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/mesh"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/upload"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// InitService wires the catalog + mesh + upload clients into the gateway service.
func InitService(cat *catalog.Client, m *mesh.Client, up *upload.Client) *service.Gateway {
	return service.New(cat, m, up)
}
