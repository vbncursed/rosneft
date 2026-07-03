// Package service is the content business layer. It validates inputs and
// delegates persistence to a Repository. One method per file — this file
// holds the Repository contract and the Content constructor.
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

//go:generate minimock -i Repository -o ./mocks -s _mock.go

// Repository is what the content service needs from persistence. The Postgres
// implementation lives in internal/storage and satisfies this implicitly.
type Repository interface {
	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
}

// Content is the content service.
type Content struct {
	repo Repository
}

// New constructs a Content backed by repo.
func New(repo Repository) *Content { return &Content{repo: repo} }
