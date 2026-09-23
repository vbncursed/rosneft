package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// placementGroupsToAPI always returns a slice, never nil: the list is required
// in the bundle and a territory without groups must serialise as [].
func placementGroupsToAPI(in []domain.PlacementGroup) []PlacementGroup {
	out := make([]PlacementGroup, len(in))
	for i, g := range in {
		out[i] = placementGroupToAPI(g)
	}
	return out
}

func placementGroupToAPI(g domain.PlacementGroup) PlacementGroup {
	return PlacementGroup{Id: g.ID, Title: g.Title, CreatedAt: g.CreatedAt, UpdatedAt: g.UpdatedAt}
}
