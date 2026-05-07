package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/pkg/blobstore"

	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/service"
)

// Compile-time assertion: the FS blob store satisfies the service contract.
var _ service.Store = (*blobstore.FS)(nil)

// InitBlobStore opens the local FS blob store. NewFS mkdirs the root.
func InitBlobStore(cfg config.Config) (*blobstore.FS, error) {
	return blobstore.NewFS(cfg.BlobDir)
}
