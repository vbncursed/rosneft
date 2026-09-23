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
	}
	for i, p := range b.Placements {
		out.Placements[i] = placementToAPI(p)
	}
	for i, m := range b.ModelOptions {
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
		out.ModelOptions[i] = opt
	}
	if b.Artifact != nil {
		out.Artifact = new(artifactToAPI(*b.Artifact, true))
	}
	if len(b.Panoramas) > 0 {
		pans := make([]Panorama, len(b.Panoramas))
		for i, p := range b.Panoramas {
			pans[i] = panoramaToAPI(p)
		}
		out.Panoramas = &pans
	}
	if len(b.Documents) > 0 {
		docs := make([]Document, len(b.Documents))
		for i, d := range b.Documents {
			docs[i] = documentToAPI(d)
		}
		out.Documents = &docs
	}
	return out
}
