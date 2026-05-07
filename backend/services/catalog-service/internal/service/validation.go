package service

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// validateArtifact rejects an artifact registration with empty slug or hash.
// Both are mandatory: slug ties the artifact to its owner; hash is the
// BlobStore key.
func validateArtifact(a domain.Artifact) error {
	if a.Slug == "" {
		return fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	if a.Hash == "" {
		return fmt.Errorf("%w: empty hash", domain.ErrInvalidInput)
	}
	return nil
}
