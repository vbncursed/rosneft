package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// SetPlacementsHidden hides or shows every placement in ids on territorySlug,
// all or none, and answers how many were written.
func (c *Client) SetPlacementsHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	resp, err := c.cc.SetPlacementsHidden(ctx, &catalogv1.SetPlacementsHiddenRequest{
		TerritorySlug: territorySlug, Ids: ids, Hidden: hidden,
	})
	if err != nil {
		return 0, editRefusal("catalog.SetPlacementsHidden", err)
	}
	return int(resp.GetUpdated()), nil
}

// SetPlacementsGroup moves every placement in ids on territorySlug into
// groupID, or out of any group when it is nil, all or none.
func (c *Client) SetPlacementsGroup(ctx context.Context, territorySlug string, ids []int64, groupID *int64) (int, error) {
	resp, err := c.cc.SetPlacementsGroup(ctx, &catalogv1.SetPlacementsGroupRequest{
		TerritorySlug: territorySlug, Ids: ids, GroupId: groupID,
	})
	if err != nil {
		return 0, editRefusal("catalog.SetPlacementsGroup", err)
	}
	return int(resp.GetUpdated()), nil
}

// ListPlacementGroups returns the territory's groups, for the scene bundle.
func (c *Client) ListPlacementGroups(ctx context.Context, territorySlug string) ([]domain.PlacementGroup, error) {
	resp, err := c.cc.ListPlacementGroups(ctx, &catalogv1.ListPlacementGroupsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListPlacementGroups: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.PlacementGroup, len(resp.GetGroups()))
	for i, g := range resp.GetGroups() {
		out[i] = placementGroupFromProto(g)
	}
	return out, nil
}

// CreatePlacementGroup adds a group to territorySlug.
func (c *Client) CreatePlacementGroup(ctx context.Context, territorySlug, title string) (domain.PlacementGroup, error) {
	resp, err := c.cc.CreatePlacementGroup(ctx, &catalogv1.CreatePlacementGroupRequest{
		TerritorySlug: territorySlug, Title: title,
	})
	if err != nil {
		return domain.PlacementGroup{}, editRefusal("catalog.CreatePlacementGroup", err)
	}
	return placementGroupFromProto(resp.GetGroup()), nil
}

// RenamePlacementGroup retitles group id on territorySlug.
func (c *Client) RenamePlacementGroup(ctx context.Context, territorySlug string, id int64, title string) (domain.PlacementGroup, error) {
	resp, err := c.cc.RenamePlacementGroup(ctx, &catalogv1.RenamePlacementGroupRequest{
		TerritorySlug: territorySlug, Id: id, Title: title,
	})
	if err != nil {
		return domain.PlacementGroup{}, editRefusal("catalog.RenamePlacementGroup", err)
	}
	return placementGroupFromProto(resp.GetGroup()), nil
}

// DeletePlacementGroup removes group id on territorySlug; its placements stay.
func (c *Client) DeletePlacementGroup(ctx context.Context, territorySlug string, id int64) error {
	_, err := c.cc.DeletePlacementGroup(ctx, &catalogv1.DeletePlacementGroupRequest{TerritorySlug: territorySlug, Id: id})
	if err != nil {
		return editRefusal("catalog.DeletePlacementGroup", err)
	}
	return nil
}

func placementGroupFromProto(g *catalogv1.PlacementGroup) domain.PlacementGroup {
	return domain.PlacementGroup{
		ID:            g.GetId(),
		TerritorySlug: g.GetTerritorySlug(),
		Title:         g.GetTitle(),
		CreatedAt:     g.GetCreatedAt().AsTime(),
		UpdatedAt:     g.GetUpdatedAt().AsTime(),
	}
}
