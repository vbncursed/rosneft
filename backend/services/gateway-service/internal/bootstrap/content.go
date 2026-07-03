package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/content"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// Compile-time assertion: content client satisfies the service-layer contract.
var _ service.Content = (*content.Client)(nil)

// InitContent dials the content gRPC service. The caller must Close the client.
func InitContent(cfg config.Config) (*content.Client, error) {
	return content.Dial(cfg.ContentGRPCAddr)
}
