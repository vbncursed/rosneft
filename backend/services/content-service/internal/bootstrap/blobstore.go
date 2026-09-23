package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/pkg/blobstore"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/config"
)

// InitBlobStore opens the shared blob volume. Panorama sources are read from
// it and their thumbnails written back. NewFS creates the root if it is missing.
func InitBlobStore(cfg config.Config) (*blobstore.FS, error) {
	return blobstore.NewFS(cfg.BlobDir)
}
