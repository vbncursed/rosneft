package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RegisterArtifact validates and persists an artifact. Idempotent on (project_slug, lod).
func (c *Catalog) RegisterArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	if a.ProjectSlug == "" {
		return domain.Artifact{}, fmt.Errorf("%w: project_slug is required", domain.ErrInvalidInput)
	}
	if a.Hash == "" {
		return domain.Artifact{}, fmt.Errorf("%w: hash is required", domain.ErrInvalidInput)
	}
	if a.ContentType == "" {
		return domain.Artifact{}, fmt.Errorf("%w: content_type is required", domain.ErrInvalidInput)
	}
	if a.Size <= 0 {
		return domain.Artifact{}, fmt.Errorf("%w: size must be positive", domain.ErrInvalidInput)
	}
	return c.repo.RegisterArtifact(ctx, a)
}
