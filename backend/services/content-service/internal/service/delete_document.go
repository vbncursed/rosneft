package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeleteDocument removes a document on territorySlug by ID. A document on
// another territory is ErrDocumentNotFound, same as an unknown id.
func (c *Content) DeleteDocument(ctx context.Context, territorySlug string, id int64) error {
	if territorySlug == "" {
		return fmt.Errorf("service.DeleteDocument: %w: empty territory slug", domain.ErrInvalidInput)
	}
	if id <= 0 {
		return fmt.Errorf("service.DeleteDocument: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeleteDocument(ctx, territorySlug, id)
}
