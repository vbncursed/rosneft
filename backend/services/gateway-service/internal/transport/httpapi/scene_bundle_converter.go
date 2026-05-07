package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// sceneBundleToAPI converts the domain bundle into the openapi DTO. Artifact
// is a pointer in the domain model (may be absent for projects whose
// conversion has not produced LOD0 yet) and stays optional in the wire
// format. The LOD chain is attached to both the parent artifact and each
// asset option so the frontend never has to issue a follow-up request to
// pick a specific level.
func sceneBundleToAPI(b domain.SceneBundle) SceneBundle {
	out := SceneBundle{
		Project:      projectToAPI(b.Project),
		Placements:   placementsToAPI(b.Placements),
		AssetOptions: assetOptionsToAPI(b.AssetOptions),
	}
	if b.Artifact != nil {
		a := artifactToAPI(*b.Artifact)
		out.Artifact = &a
	}
	return out
}

func assetOptionToAPI(o domain.AssetOption) AssetOption {
	return AssetOption{
		Slug:      o.Slug,
		Title:     o.Title,
		Artifacts: lodChainToAPI(o.LODs),
	}
}

func assetOptionsToAPI(in []domain.AssetOption) []AssetOption {
	out := make([]AssetOption, len(in))
	for i, o := range in {
		out[i] = assetOptionToAPI(o)
	}
	return out
}

// lodChainToAPI projects the domain LOD chain onto the openapi DTO. Returns
// a non-nil empty slice (rather than nil) so JSON encoding always produces
// `"artifacts": []` for AssetOption — the wire shape declares it required.
func lodChainToAPI(in []domain.LodArtifact) []LodArtifact {
	out := make([]LodArtifact, len(in))
	for i, l := range in {
		v := int64(l.Vertices)
		f := int64(l.Faces)
		out[i] = LodArtifact{
			Lod:      int32(l.LOD),
			Hash:     l.Hash,
			Size:     l.Size,
			Vertices: &v,
			Faces:    &f,
		}
	}
	return out
}
