package catalog

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// CreatePlacement persists a new placement in catalog. NotFound on either
// parent or asset is mapped to ErrProjectNotFound; the catalog signals
// self-placement with InvalidArgument and the message "self", which we
// translate into the dedicated sentinel.
func (c *Client) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	resp, err := c.cc.CreatePlacement(ctx, &catalogv1.CreatePlacementRequest{
		ParentSlug: p.ParentSlug,
		AssetSlug:  p.AssetSlug,
		Position:   vec3ToProto(p.Position),
		Rotation:   vec3ToProto(p.Rotation),
		Scale:      vec3ToProto(p.Scale),
		Label:      p.Label,
	})
	if err != nil {
		return domain.Placement{}, fmt.Errorf("catalog.CreatePlacement: %w", mapPlacementErr(err))
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// mapPlacementErr translates the catalog's gRPC status set into gateway
// domain sentinels: NotFound → ErrProjectNotFound, InvalidArgument carrying
// the self-placement marker → ErrSelfPlacement, anything else → ErrInvalidInput
// when InvalidArgument, otherwise the raw error.
func mapPlacementErr(err error) error {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return err
	}
	switch st.Code() {
	case codes.NotFound:
		return errors.Join(domain.ErrProjectNotFound, err)
	case codes.InvalidArgument:
		if strings.Contains(st.Message(), "place a project onto itself") {
			return errors.Join(domain.ErrSelfPlacement, err)
		}
		return errors.Join(domain.ErrInvalidInput, err)
	}
	return err
}
