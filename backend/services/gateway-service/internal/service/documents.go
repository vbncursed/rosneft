package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListDocuments returns the documents attached to a territory.
func (g *Gateway) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.content.ListDocuments(ctx, territorySlug)
}

// CreateDocument validates input and persists the document.
func (g *Gateway) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	if d.TerritorySlug == "" {
		return domain.Document{}, fmt.Errorf("%w: territory slug is required", domain.ErrInvalidInput)
	}
	if d.Title == "" {
		return domain.Document{}, fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	if d.SourceBlobHash == "" {
		return domain.Document{}, fmt.Errorf("%w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return g.content.CreateDocument(ctx, d)
}

// DeleteDocument removes a document by ID.
func (g *Gateway) DeleteDocument(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.content.DeleteDocument(ctx, id)
}
