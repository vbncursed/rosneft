package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeleteDocument removes a document by ID.
func (c *Content) DeleteDocument(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("service.DeleteDocument: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeleteDocument(ctx, id)
}
