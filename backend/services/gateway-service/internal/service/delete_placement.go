package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) DeletePlacement(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.DeletePlacement(ctx, id)
}
