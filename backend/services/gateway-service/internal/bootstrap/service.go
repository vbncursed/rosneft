package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/catalog"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/content"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/mesh"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/upload"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// InitService wires the catalog + content + mesh + upload clients into the gateway service.
func InitService(cat *catalog.Client, con *content.Client, m *mesh.Client, up *upload.Client) *service.Gateway {
	return service.New(cat, con, m, up)
}
