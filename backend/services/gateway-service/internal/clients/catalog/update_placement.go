package catalog

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// UpdatePlacement replaces the transform of an existing placement. NotFound
// surfaces as ErrPlacementNotFound; InvalidArgument as ErrInvalidInput.
func (c *Client) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	resp, err := c.cc.UpdatePlacement(ctx, &catalogv1.UpdatePlacementRequest{
		Id:       p.ID,
		Position: vec3ToProto(p.Position),
		Rotation: vec3ToProto(p.Rotation),
		Scale:    vec3ToProto(p.Scale),
		Label:    p.Label,
	})
	if err != nil {
		st, ok := status.FromError(err)
		if ok {
			switch st.Code() {
			case codes.NotFound:
				return domain.Placement{}, fmt.Errorf("catalog.UpdatePlacement: %w", errors.Join(domain.ErrPlacementNotFound, err))
			case codes.InvalidArgument:
				return domain.Placement{}, fmt.Errorf("catalog.UpdatePlacement: %w", errors.Join(domain.ErrInvalidInput, err))
			}
		}
		return domain.Placement{}, fmt.Errorf("catalog.UpdatePlacement: %w", err)
	}
	return placementFromProto(resp.GetPlacement()), nil
}
