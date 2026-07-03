package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListModels proxies to catalog.
func (g *Gateway) ListModels(ctx context.Context) ([]domain.Model, error) {
	return g.catalog.ListModels(ctx)
}

// GetModel fetches a model by slug.
func (g *Gateway) GetModel(ctx context.Context, slug string) (domain.Model, error) {
	if slug == "" {
		return domain.Model{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.GetModel(ctx, slug)
}

// CreateModel upserts the model in the catalog and queues a conversion job.
func (g *Gateway) CreateModel(ctx context.Context, m domain.Model) (domain.Model, domain.Job, error) {
	if err := validateEntity(m.Title, m.SourceBlobHash); err != nil {
		return domain.Model{}, domain.Job{}, err
	}
	saved, err := g.catalog.UpsertModel(ctx, m)
	if err != nil {
		return domain.Model{}, domain.Job{}, fmt.Errorf("create model: %w", err)
	}
	job, err := g.mesh.SubmitConversion(ctx, domain.KindModel, saved.Slug)
	if err != nil {
		return saved, domain.Job{}, fmt.Errorf("submit conversion: %w", err)
	}
	return saved, job, nil
}

// UpdateModel patches a model's mutable fields by slug without touching the
// source archive or re-queuing a conversion. Read-modify-write over the
// existing catalog RPCs (fetch, apply non-nil patch fields, upsert) —
// mirrors UpdateTerritory.
func (g *Gateway) UpdateModel(ctx context.Context, slug string, update domain.ModelUpdate) (domain.Model, error) {
	if slug == "" {
		return domain.Model{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	current, err := g.catalog.GetModel(ctx, slug)
	if err != nil {
		return domain.Model{}, err
	}
	if update.ThumbnailBlobHash != nil {
		current.ThumbnailBlobHash = *update.ThumbnailBlobHash
	}
	saved, err := g.catalog.UpsertModel(ctx, current)
	if err != nil {
		return domain.Model{}, fmt.Errorf("update model: %w", err)
	}
	return saved, nil
}

// DeleteModel removes a model by slug. Refuses if the model is still
// referenced by placements (catalog returns InvalidArgument upstream).
func (g *Gateway) DeleteModel(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.DeleteModel(ctx, slug)
}

// ListModelArtifacts returns every model artifact ordered by LOD.
func (g *Gateway) ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if slug == "" {
		return nil, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListModelArtifacts(ctx, slug)
}

// GetModelArtifact returns one model artifact at the given LOD.
func (g *Gateway) GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if slug == "" {
		return domain.Artifact{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.GetModelArtifact(ctx, slug, lod)
}
