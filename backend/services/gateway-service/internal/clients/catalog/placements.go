package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListPlacements returns every placement on the given territory.
func (c *Client) ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error) {
	resp, err := c.cc.ListPlacements(ctx, &catalogv1.ListPlacementsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListPlacements: %w", mapStatusErr(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Placement, len(resp.GetPlacements()))
	for i, p := range resp.GetPlacements() {
		out[i] = placementFromProto(p)
	}
	return out, nil
}

// CreatePlacement adds a new placement.
func (c *Client) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	resp, err := c.cc.CreatePlacement(ctx, &catalogv1.CreatePlacementRequest{
		TerritorySlug:      p.TerritorySlug,
		ModelSlug:          p.ModelSlug,
		Position:           vec3ToProto(p.Position),
		Rotation:           vec3ToProto(p.Rotation),
		Scale:              vec3ToProto(p.Scale),
		Label:              p.Label,
		VisiblePanoramaIds: p.VisiblePanoramaIDs,
	})
	if err != nil {
		return domain.Placement{}, fmt.Errorf("catalog.CreatePlacement: %w", mapStatusErr(err, domain.ErrTerritoryNotFound))
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// SetPlacementVisibility replaces a placement's panorama allowlist.
func (c *Client) SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	resp, err := c.cc.SetPlacementVisibility(ctx, &catalogv1.SetPlacementVisibilityRequest{
		TerritorySlug: territorySlug,
		PlacementId:   placementID,
		PanoramaIds:   panoramaIDs,
	})
	if err != nil {
		return domain.Placement{}, fmt.Errorf("catalog.SetPlacementVisibility: %w", mapStatusErr(err, domain.ErrPlacementNotFound))
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// SetPlacementPanoramaLabel sets (or clears, when label is empty) a
// placement's name within one panorama.
func (c *Client) SetPlacementPanoramaLabel(ctx context.Context, territorySlug string, placementID, panoramaID int64, label string) (domain.Placement, error) {
	resp, err := c.cc.SetPlacementPanoramaLabel(ctx, &catalogv1.SetPlacementPanoramaLabelRequest{
		TerritorySlug: territorySlug,
		PlacementId:   placementID,
		PanoramaId:    panoramaID,
		Label:         label,
	})
	if err != nil {
		return domain.Placement{}, fmt.Errorf("catalog.SetPlacementPanoramaLabel: %w", mapStatusErr(err, domain.ErrPlacementNotFound))
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// UpdatePlacement replaces a placement's transform and label.
func (c *Client) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	resp, err := c.cc.UpdatePlacement(ctx, &catalogv1.UpdatePlacementRequest{
		Id:       p.ID,
		Position: vec3ToProto(p.Position),
		Rotation: vec3ToProto(p.Rotation),
		Scale:    vec3ToProto(p.Scale),
		Label:    p.Label,
	})
	if err != nil {
		return domain.Placement{}, fmt.Errorf("catalog.UpdatePlacement: %w", mapStatusErr(err, domain.ErrPlacementNotFound))
	}
	return placementFromProto(resp.GetPlacement()), nil
}

// DeletePlacement removes a placement by ID.
func (c *Client) DeletePlacement(ctx context.Context, id int64) error {
	_, err := c.cc.DeletePlacement(ctx, &catalogv1.DeletePlacementRequest{Id: id})
	if err != nil {
		return fmt.Errorf("catalog.DeletePlacement: %w", mapStatusErr(err, domain.ErrPlacementNotFound))
	}
	return nil
}
