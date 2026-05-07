package storage

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// GetStatus returns the current session metadata.
func (f *FS) GetStatus(_ context.Context, id string) (domain.Session, error) {
	_, _, metaPath, err := f.paths(id)
	if err != nil {
		return domain.Session{}, err
	}
	return readMeta(metaPath)
}
