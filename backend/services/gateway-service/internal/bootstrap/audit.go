package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// Compile-time assertion: audit client satisfies the service-layer contract.
var _ service.Audit = (*audit.Client)(nil)

// InitAudit dials the audit gRPC service. The caller must Close the client.
func InitAudit(cfg config.Config) (*audit.Client, error) {
	return audit.Dial(cfg.AuditGRPCAddr)
}
