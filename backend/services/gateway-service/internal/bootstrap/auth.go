package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// InitAuth dials the auth gRPC service. The caller must Close the client.
func InitAuth(cfg config.Config) (*auth.Client, error) {
	return auth.Dial(cfg.AuthGRPCAddr)
}
