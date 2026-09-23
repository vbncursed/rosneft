package catalog

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListPlacements returns every placement on the given territory.
func (c *Client) ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error) {
	resp, err := c.cc.ListPlacements(ctx, &catalogv1.ListPlacementsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListPlacements: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Placement, len(resp.GetPlacements()))
	for i, p := range resp.GetPlacements() {
		out[i] = placementFromProto(p)
	}
	return out, nil
}

// CreatePlacement adds a new placement.
func (c *Client) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	resp, err := c.cc.CreatePlacement(ctx, createPlacementRequest(p))
	if err != nil {
		return domain.Placement{}, createRefusal("catalog.CreatePlacement", err)
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// CreatePlacements lands a batch on territorySlug in one catalog transaction,
// idempotently under key when it is not empty.
func (c *Client) CreatePlacements(ctx context.Context, territorySlug, key string, ps []domain.Placement) ([]domain.Placement, error) {
	items := make([]*catalogv1.CreatePlacementRequest, len(ps))
	for i, p := range ps {
		items[i] = createPlacementRequest(p)
	}
	resp, err := c.cc.CreatePlacements(ctx, &catalogv1.CreatePlacementsRequest{
		TerritorySlug: territorySlug, Items: items, IdempotencyKey: key,
	})
	if err != nil {
		return nil, createRefusal("catalog.CreatePlacements", err)
	}
	out := make([]domain.Placement, len(resp.GetPlacements()))
	for i, p := range resp.GetPlacements() {
		out[i] = placementFromProto(p)
	}
	return out, nil
}

// refusal is a create the catalog refused, told in the catalog's own words
// ("item 2: model not found"): the handler puts Error() in the 4xx body, so the
// gRPC framing must not be in it. Unwrap names the sentinel for the status.
type refusal struct {
	msg      string
	sentinel error
}

func (r refusal) Error() string { return r.msg }

func (r refusal) Unwrap() error { return r.sentinel }

// createRefusal maps a failed placement create. NotFound is the model unless
// the message says otherwise — the route's gate has already found the
// territory; InvalidArgument is a refused item; AlreadyExists is an
// idempotency key reused for another batch. Anything else is wrapped with op
// as an internal error.
func createRefusal(op string, err error) error {
	st, ok := status.FromError(err)
	switch {
	case !ok:
		return fmt.Errorf("%s: %w", op, err)
	case st.Code() == codes.NotFound && strings.HasSuffix(st.Message(), domain.ErrTerritoryNotFound.Error()):
		return refusal{st.Message(), domain.ErrTerritoryNotFound}
	case st.Code() == codes.NotFound:
		return refusal{st.Message(), domain.ErrModelNotFound}
	case st.Code() == codes.InvalidArgument:
		return refusal{st.Message(), domain.ErrInvalidInput}
	case st.Code() == codes.AlreadyExists:
		return refusal{st.Message(), domain.ErrIdempotencyConflict}
	}
	return fmt.Errorf("%s: %w", op, err)
}

// editRefusal maps a failed placement update, visibility change or delete the
// way createRefusal maps a create: the catalog's own words for NotFound
// (placement or territory, the message says which) and InvalidArgument, and
// an internal error, wrapped with op, for anything else.
func editRefusal(op string, err error) error {
	st, ok := status.FromError(err)
	switch {
	case ok && st.Code() == codes.NotFound:
		return refusal{st.Message(), domain.ErrPlacementNotFound}
	case ok && st.Code() == codes.InvalidArgument:
		return refusal{st.Message(), domain.ErrInvalidInput}
	}
	return fmt.Errorf("%s: %w", op, err)
}

// createPlacementRequest maps a domain placement onto one create request.
func createPlacementRequest(p domain.Placement) *catalogv1.CreatePlacementRequest {
	return &catalogv1.CreatePlacementRequest{
		TerritorySlug:      p.TerritorySlug,
		ModelSlug:          p.ModelSlug,
		Position:           vec3ToProto(p.Position),
		Rotation:           vec3ToProto(p.Rotation),
		Scale:              vec3ToProto(p.Scale),
		Label:              p.Label,
		VisiblePanoramaIds: p.VisiblePanoramaIDs,
	}
}

// SetPlacementVisibility replaces a placement's panorama allowlist.
func (c *Client) SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	resp, err := c.cc.SetPlacementVisibility(ctx, &catalogv1.SetPlacementVisibilityRequest{
		TerritorySlug: territorySlug,
		PlacementId:   placementID,
		PanoramaIds:   panoramaIDs,
	})
	if err != nil {
		return domain.Placement{}, editRefusal("catalog.SetPlacementVisibility", err)
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// UpdatePlacement replaces a placement's transform and label.
func (c *Client) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	resp, err := c.cc.UpdatePlacement(ctx, &catalogv1.UpdatePlacementRequest{
		Id:            p.ID,
		TerritorySlug: p.TerritorySlug,
		Position:      vec3ToProto(p.Position),
		Rotation:      vec3ToProto(p.Rotation),
		Scale:         vec3ToProto(p.Scale),
		Label:         p.Label,
	})
	if err != nil {
		return domain.Placement{}, editRefusal("catalog.UpdatePlacement", err)
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// DeletePlacement removes a placement on territorySlug by ID.
func (c *Client) DeletePlacement(ctx context.Context, territorySlug string, id int64) error {
	_, err := c.cc.DeletePlacement(ctx, &catalogv1.DeletePlacementRequest{Id: id, TerritorySlug: territorySlug})
	if err != nil {
		return editRefusal("catalog.DeletePlacement", err)
	}
	return nil
}
