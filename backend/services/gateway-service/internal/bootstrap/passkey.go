package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// InitPasskey dials the passkey gRPC service. The caller must Close the client.
func InitPasskey(cfg config.Config) (*passkey.Client, error) {
	return passkey.Dial(cfg.PasskeyGRPCAddr)
}
