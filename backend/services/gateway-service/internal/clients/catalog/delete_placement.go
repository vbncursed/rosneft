package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// DeletePlacement removes a placement by ID. NotFound is mapped to
// domain.ErrPlacementNotFound; everything else passes through.
func (c *Client) DeletePlacement(ctx context.Context, id int64) error {
	if _, err := c.cc.DeletePlacement(ctx, &catalogv1.DeletePlacementRequest{Id: id}); err != nil {
		return fmt.Errorf("catalog.DeletePlacement: %w", mapStatusErr(err, domain.ErrPlacementNotFound))
	}
	return nil
}
