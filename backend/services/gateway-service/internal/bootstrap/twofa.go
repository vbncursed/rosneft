package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// InitTwoFA dials the twofa gRPC service. The caller must Close the client.
func InitTwoFA(cfg config.Config) (*twofa.Client, error) {
	return twofa.Dial(cfg.TwoFAGRPCAddr)
}
