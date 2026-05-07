package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePlacement removes a placement by ID. ID must be positive; zero is
// treated as ErrInvalidInput so a caller that forgot to bind the path param
// gets a 400 rather than a 404.
func (c *Catalog) DeletePlacement(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("service.DeletePlacement: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeletePlacement(ctx, id)
}
