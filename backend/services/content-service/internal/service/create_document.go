package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// CreateDocument validates the input and persists the document. source_blob_hash
// is immutable; there is no slug and no update path.
func (c *Content) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	if d.TerritorySlug == "" {
		return domain.Document{}, fmt.Errorf("service.CreateDocument: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	if d.Title == "" {
		return domain.Document{}, fmt.Errorf("service.CreateDocument: %w: title is required", domain.ErrInvalidInput)
	}
	if d.SourceBlobHash == "" {
		return domain.Document{}, fmt.Errorf("service.CreateDocument: %w: source_blob_hash is required", domain.ErrInvalidInput)
	}
	return c.repo.CreateDocument(ctx, d)
}
