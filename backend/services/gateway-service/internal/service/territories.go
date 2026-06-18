package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListTerritories proxies to catalog.
func (g *Gateway) ListTerritories(ctx context.Context) ([]domain.Territory, error) {
	return g.catalog.ListTerritories(ctx)
}

// GetTerritory fetches a territory by slug.
func (g *Gateway) GetTerritory(ctx context.Context, slug string) (domain.Territory, error) {
	if slug == "" {
		return domain.Territory{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.GetTerritory(ctx, slug)
}

// CreateTerritory upserts the territory in the catalog and queues a
// conversion job. Returns both — the frontend uses the job ID to subscribe
// to /api/jobs/{id}/events for progress.
func (g *Gateway) CreateTerritory(ctx context.Context, t domain.Territory) (domain.Territory, domain.Job, error) {
	if err := validateEntity(t.Title, t.SourceBlobHash); err != nil {
		return domain.Territory{}, domain.Job{}, err
	}
	saved, err := g.catalog.UpsertTerritory(ctx, t)
	if err != nil {
		return domain.Territory{}, domain.Job{}, fmt.Errorf("create territory: %w", err)
	}
	job, err := g.mesh.SubmitConversion(ctx, domain.KindTerritory, saved.Slug)
	if err != nil {
		return saved, domain.Job{}, fmt.Errorf("submit conversion: %w", err)
	}
	return saved, job, nil
}

// UpdateTerritory patches a territory's mutable fields by slug without
// touching the source archive or re-queuing a conversion. It is a
// read-modify-write over the existing catalog RPCs: fetch, apply the
// non-nil patch fields, upsert the merged row back.
func (g *Gateway) UpdateTerritory(ctx context.Context, slug string, update domain.TerritoryUpdate) (domain.Territory, error) {
	if slug == "" {
		return domain.Territory{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	current, err := g.catalog.GetTerritory(ctx, slug)
	if err != nil {
		return domain.Territory{}, err
	}
	if update.ExternalPanoramaURL != nil {
		current.ExternalPanoramaURL = *update.ExternalPanoramaURL
	}
	saved, err := g.catalog.UpsertTerritory(ctx, current)
	if err != nil {
		return domain.Territory{}, fmt.Errorf("update territory: %w", err)
	}
	return saved, nil
}

// DeleteTerritory removes a territory by slug.
func (g *Gateway) DeleteTerritory(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.DeleteTerritory(ctx, slug)
}

// ListTerritoryArtifacts returns every territory artifact ordered by LOD.
func (g *Gateway) ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if slug == "" {
		return nil, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListTerritoryArtifacts(ctx, slug)
}

// GetTerritoryArtifact returns one territory artifact at the given LOD.
func (g *Gateway) GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if slug == "" {
		return domain.Artifact{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	return g.catalog.GetTerritoryArtifact(ctx, slug, lod)
}

// validateEntity rejects EntityCreate-style inputs missing required fields.
// The slug is no longer user-supplied — the catalog derives it from the
// title — so only title and source hash are required here.
func validateEntity(title, hash string) error {
	switch {
	case title == "":
		return fmt.Errorf("%w: empty title", domain.ErrInvalidInput)
	case hash == "":
		return fmt.Errorf("%w: empty source_blob_hash", domain.ErrInvalidInput)
	}
	return nil
}

// errArtifactMissing helps SceneBundle distinguish "no artifact yet" from
// other errors. Re-exported through the domain package would be overkill —
// this is internal to gateway service code.
var errArtifactMissing = errors.New("no artifact yet")
