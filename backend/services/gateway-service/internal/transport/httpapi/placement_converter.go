package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// placementToAPI maps a domain placement to its API shape. The visibility
// allowlist is always emitted (as [] when empty) so the client can filter
// deterministically instead of guessing at an absent field.
func placementToAPI(p domain.Placement) Placement {
	out := Placement{
		Id:            p.ID,
		TerritorySlug: p.TerritorySlug,
		ModelSlug:     p.ModelSlug,
		Position:      vec3ToAPI(p.Position),
		Rotation:      vec3ToAPI(p.Rotation),
		Scale:         vec3ToAPI(p.Scale),
	}
	if p.Label != "" {
		out.Label = &p.Label
	}
	if !p.CreatedAt.IsZero() {
		out.CreatedAt = &p.CreatedAt
	}
	if !p.UpdatedAt.IsZero() {
		out.UpdatedAt = &p.UpdatedAt
	}
	ids := p.VisiblePanoramaIDs
	if ids == nil {
		ids = []int64{}
	}
	out.VisiblePanoramaIds = &ids
	return out
}

// placementFromCreate maps one PlacementCreate (alone, or an item of a batch)
// onto a domain placement on slug.
func placementFromCreate(slug string, body PlacementCreate) domain.Placement {
	p := domain.Placement{
		TerritorySlug: slug,
		ModelSlug:     body.ModelSlug,
		Position:      vec3PtrFromAPI(body.Position),
		Rotation:      vec3PtrFromAPI(body.Rotation),
		Scale:         vec3PtrFromAPI(body.Scale),
	}
	if body.Label != nil {
		p.Label = *body.Label
	}
	if body.VisiblePanoramaIds != nil {
		p.VisiblePanoramaIDs = *body.VisiblePanoramaIds
	}
	return p
}
