package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func sceneBundleToAPI(b domain.SceneBundle) SceneBundle {
	out := SceneBundle{
		Territory:       territoryToAPI(b.Territory),
		Placements:      make([]Placement, len(b.Placements)),
		ModelOptions:    make([]AssetOption, len(b.ModelOptions)),
		Measurements:    measurementsToAPI(b.Measurements),
		PlacementGroups: placementGroupsToAPI(b.PlacementGroups),
		PanoramaPhases:  panoramaPhasesToAPI(b.PanoramaPhases),
		Panoramas:       panoramasIfAny(b.Panoramas),
		Documents:       documentsIfAny(b.Documents),
	}
	for i, p := range b.Placements {
		out.Placements[i] = placementToAPI(p)
	}
	for i, m := range b.ModelOptions {
		out.ModelOptions[i] = assetOptionToAPI(m)
	}
	if b.Artifact != nil {
		out.Artifact = new(artifactToAPI(*b.Artifact, true))
	}
	return out
}

func assetOptionToAPI(m domain.AssetOption) AssetOption {
	opt := AssetOption{
		Slug:      m.Slug,
		Title:     m.Title,
		Artifacts: lodChainToAPI(m.LODs),
	}
	if m.ThumbnailBlobHash != "" {
		opt.ThumbnailBlobHash = &m.ThumbnailBlobHash
	}
	if m.BBoxMin != nil {
		opt.BboxMin = new(vec3ToAPI(*m.BBoxMin))
	}
	if m.BBoxMax != nil {
		opt.BboxMax = new(vec3ToAPI(*m.BBoxMax))
	}
	return opt
}

// panoramasIfAny is nil (field omitted) when the territory has none.
func panoramasIfAny(in []domain.Panorama) *[]Panorama {
	if len(in) == 0 {
		return nil
	}
	out := make([]Panorama, len(in))
	for i, p := range in {
		out[i] = panoramaToAPI(p)
	}
	return &out
}

// documentsIfAny is nil (field omitted) when the territory has none.
func documentsIfAny(in []domain.Document) *[]Document {
	if len(in) == 0 {
		return nil
	}
	out := make([]Document, len(in))
	for i, d := range in {
		out[i] = documentToAPI(d)
	}
	return &out
}
