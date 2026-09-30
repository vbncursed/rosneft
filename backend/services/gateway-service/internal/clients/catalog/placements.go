package catalog

import (
	"context"
	"fmt"

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

// catalogNotFound are the catalog NotFound answers told apart by the sentinel
// text the message carries: at its start, or after "item N: " in a batch.
// "placement group not found" does not contain "placement not found", so the
// order does not matter.
var catalogNotFound = []error{
	domain.ErrPlacementGroupNotFound, domain.ErrPlacementNotFound,
	domain.ErrTerritoryNotFound, domain.ErrModelNotFound,
}

// createRefusal maps a failed placement create: an idempotency key reused for
// another batch is its own refusal; the rest as any write, the model when a
// NotFound names nothing (the route's gate has already found the territory).
func createRefusal(op string, err error) error {
	if st, ok := status.FromError(err); ok && st.Code() == codes.AlreadyExists {
		return grpcerr.Refusal{Msg: st.Message(), Sentinel: domain.ErrIdempotencyConflict}
	}
	return grpcerr.Refused(op, err, domain.ErrModelNotFound, catalogNotFound...)
}

// editRefusal maps a failed placement or group edit.
func editRefusal(op string, err error) error {
	return grpcerr.Refused(op, err, domain.ErrPlacementNotFound, catalogNotFound...)
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
		GroupId:            p.GroupID,
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
