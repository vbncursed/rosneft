package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/upload"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// Compile-time assertion: upload client satisfies the service-layer contract.
var _ service.Upload = (*upload.Client)(nil)

// InitUpload dials the upload-service gRPC. The caller must Close the client.
func InitUpload(cfg config.Config) (*upload.Client, error) {
	return upload.Dial(cfg.UploadGRPCAddr)
}
