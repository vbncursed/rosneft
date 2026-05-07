package bootstrap

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/storage"
)

// InitSessionStore builds the on-disk session store rooted at IncomingDir.
func InitSessionStore(cfg config.Config) (*storage.FS, error) {
	fs, err := storage.NewFS(cfg.IncomingDir)
	if err != nil {
		return nil, fmt.Errorf("init session store: %w", err)
	}
	return fs, nil
}

// InitBlobs builds the BlobStore writer rooted at BlobDir.
func InitBlobs(cfg config.Config) (*blobstore.FS, error) {
	bs, err := blobstore.NewFS(cfg.BlobDir)
	if err != nil {
		return nil, fmt.Errorf("init blobstore: %w", err)
	}
	return bs, nil
}
