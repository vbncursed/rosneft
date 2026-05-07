package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/storage"
)

// InitService wires the upload business layer.
func InitService(cfg config.Config, store *storage.FS, blobs *blobstore.FS) *service.Upload {
	return service.New(service.Config{
		Store:          store,
		Blobs:          blobs,
		MaxUploadBytes: cfg.MaxUploadBytes,
	})
}
