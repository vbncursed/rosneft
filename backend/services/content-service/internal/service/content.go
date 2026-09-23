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
	DeletePanorama(ctx context.Context, territorySlug string, id int64) error
	ListPanoramasWithoutThumbnail(ctx context.Context) ([]domain.Panorama, error)
	SetPanoramaThumbnail(ctx context.Context, id int64, hash string) error

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, territorySlug string, id int64) error
}

// Thumbnailer turns the image blob srcHash into a thumbnail blob and returns
// its hash. Bootstrap closes over internal/thumbnail and the blob store, which
// keeps the filesystem out of this package and its tests.
type Thumbnailer func(ctx context.Context, srcHash string) (string, error)

// Content is the content service.
type Content struct {
	repo  Repository
	thumb Thumbnailer
}

// New constructs a Content backed by repo, making panorama thumbnails with thumb.
func New(repo Repository, thumb Thumbnailer) *Content { return &Content{repo: repo, thumb: thumb} }
