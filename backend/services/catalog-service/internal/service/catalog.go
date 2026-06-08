// Package service is the catalog business layer. It validates inputs and
// delegates persistence to a Repository. One method per file — this file
// holds the Repository contract and the Catalog constructor.
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Repository is what the catalog service needs from persistence. The
// Postgres implementation lives in internal/storage and satisfies this
// implicitly.
type Repository interface {
	UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error)
	GetTerritory(ctx context.Context, slug string) (domain.Territory, error)
	ListTerritories(ctx context.Context) ([]domain.Territory, error)
	DeleteTerritory(ctx context.Context, slug string) error
	RegisterTerritoryArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)

	UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error)
	GetModel(ctx context.Context, slug string) (domain.Model, error)
	ListModels(ctx context.Context) ([]domain.Model, error)
	DeleteModel(ctx context.Context, slug string) error
	RegisterModelArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)

	ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error

	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error
}

// Catalog is the catalog service.
type Catalog struct {
	repo Repository
}

// New constructs a Catalog backed by repo.
func New(repo Repository) *Catalog {
	return &Catalog{repo: repo}
}
