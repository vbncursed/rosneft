package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteDocument removes a document by ID.
func (c *Catalog) DeleteDocument(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("service.DeleteDocument: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeleteDocument(ctx, id)
}
