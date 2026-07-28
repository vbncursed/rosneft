package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
)

// ResolveTerritorySlugs maps territory ids to slugs for labelling the audit
// journal. An id that matches nothing is absent from the map, so NotFound has no
// meaning and the sentinel is nil.
func (c *Client) ResolveTerritorySlugs(
	ctx context.Context, ids []int64,
) (map[int64]string, error) {
	resp, err := c.cc.ResolveTerritorySlugs(ctx, &catalogv1.ResolveTerritorySlugsRequest{Ids: ids})
	if err != nil {
		return nil, fmt.Errorf("catalog.ResolveTerritorySlugs: %w", grpcerr.MapStatus(err, nil))
	}
	return resp.GetSlugs(), nil
}
