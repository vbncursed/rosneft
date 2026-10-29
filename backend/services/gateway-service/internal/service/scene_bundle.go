package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetSceneBundle is the single-shot composition for the viewer page. It
// fans out its reads in parallel — territory, territory artifacts,
// placements, placement groups, measurements, the model catalog, panoramas,
// panorama phase flags and documents — and stitches the result together.
//
// A missing LOD0 territory artifact is not an error: SceneBundle.Artifact
// is left nil so the frontend renders a "conversion pending" placeholder.
func (g *Gateway) GetSceneBundle(ctx context.Context, slug, scopeAdminID string) (domain.SceneBundle, error) {
	if slug == "" {
		return domain.SceneBundle{}, fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}

	d, err := g.readScene(ctx, slug, scopeAdminID)
	if err != nil {
		return domain.SceneBundle{}, err
	}
	return assembleSceneBundle(d), nil
}

// assembleSceneBundle stitches the fan-out results into the response shape.
func assembleSceneBundle(d sceneReads) domain.SceneBundle {
	bundle := domain.SceneBundle{
		Territory:       d.territory,
		Placements:      nilToEmpty(d.placements),
		Panoramas:       nilToEmpty(d.panoramas),
		Documents:       nilToEmpty(d.documents),
		Measurements:    nilToEmpty(d.measures),
		PlacementGroups: nilToEmpty(d.groups),
		PanoramaPhases:  d.phases,
	}
	if d.phases == nil {
		// No answer — a content-service without the RPC, or no such
		// territory: every phase shown. Content lists all three otherwise.
		bundle.PanoramaPhases = allPhasesShown()
	}
	if a, ok := pickLOD0(d.artifacts); ok {
		a.LODs = lodChain(d.artifacts)
		bundle.Artifact = &a
	}
	bundle.ModelOptions = buildModelOptions(d.models)
	return bundle
}

// pickLOD0 returns the LOD0 artifact from a catalog list, if present.
func pickLOD0(arts []domain.Artifact) (domain.Artifact, bool) {
	for _, a := range arts {
		if a.LOD == 0 {
			return a, true
		}
	}
	return domain.Artifact{}, false
}

// lodChain projects the full artifact list down to LOD descriptors for the
// viewer-side LOD picker.
func lodChain(arts []domain.Artifact) []domain.LodArtifact {
	out := make([]domain.LodArtifact, len(arts))
	for i, a := range arts {
		out[i] = domain.LodArtifact{
			LOD:       a.LOD,
			Hash:      a.Hash,
			Size:      a.Size,
			Vertices:  a.Vertices,
			Faces:     a.Faces,
			PlainHash: a.PlainHash,
		}
	}
	return out
}

// nilToEmpty turns a nil list into an empty one, so the bundle serialises as
// [] rather than null.
func nilToEmpty[T any](in []T) []T {
	if in == nil {
		return []T{}
	}
	return in
}

// allPhasesShown is the phase list when content has none to give.
func allPhasesShown() []domain.PanoramaPhase {
	out := make([]domain.PanoramaPhase, len(domain.PanoramaPhases))
	for i, name := range domain.PanoramaPhases {
		out[i].Phase = name
	}
	return out
}
