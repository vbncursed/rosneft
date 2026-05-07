package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/pkg/blobstore"

	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/service"
)

// InitService wires the blob store into the asset service.
func InitService(store *blobstore.FS) *service.Asset {
	return service.New(store)
}
