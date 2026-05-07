// Package service is the catalog business layer. It validates inputs and
// delegates persistence to a Repository. One method per file — this file
// holds the Repository contract and the Catalog constructor.
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Repository is what the catalog service needs from persistence. The Postgres
// implementation lives in internal/storage and satisfies this implicitly.
type Repository interface {
	UpsertProject(ctx context.Context, p domain.Project) (domain.Project, error)
	GetProject(ctx context.Context, slug string) (domain.Project, error)
	ListProjects(ctx context.Context) ([]domain.Project, error)

	RegisterArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)

	ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error
}

// Catalog is the catalog service.
type Catalog struct {
	repo Repository
}

// New constructs a Catalog backed by repo.
func New(repo Repository) *Catalog {
	return &Catalog{repo: repo}
}
