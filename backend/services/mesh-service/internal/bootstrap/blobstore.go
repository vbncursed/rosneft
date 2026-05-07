package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/pkg/blobstore"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

// Compile-time assertion: the FS blob store satisfies the worker's contract.
var _ service.BlobStore = (*blobstore.FS)(nil)

// InitBlobStore opens the local FS blob store. mkdir-on-empty is handled by NewFS.
func InitBlobStore(cfg config.Config) (*blobstore.FS, error) {
	return blobstore.NewFS(cfg.BlobDir)
}
