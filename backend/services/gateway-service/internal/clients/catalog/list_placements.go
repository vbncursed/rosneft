package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListPlacements returns every placement attached to the parent project.
// A missing parent surfaces as domain.ErrProjectNotFound.
func (c *Client) ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error) {
	resp, err := c.cc.ListPlacements(ctx, &catalogv1.ListPlacementsRequest{ParentSlug: parentSlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListPlacements: %w", mapStatusErr(err, domain.ErrProjectNotFound))
	}
	out := make([]domain.Placement, 0, len(resp.GetPlacements()))
	for _, p := range resp.GetPlacements() {
		out = append(out, placementFromProto(p))
	}
	return out, nil
}
