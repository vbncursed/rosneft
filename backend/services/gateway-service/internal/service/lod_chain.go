package service

import (
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// lodChainFromArtifacts projects a list of full Artifact records onto the
// minimal LodArtifact descriptors used inside SceneBundle. Sorts by LOD
// ascending so the wire format is predictable for clients that pick the
// first / last entry.
func lodChainFromArtifacts(artifacts []domain.Artifact) []domain.LodArtifact {
	if len(artifacts) == 0 {
		return nil
	}
	out := make([]domain.LodArtifact, 0, len(artifacts))
	for _, a := range artifacts {
		out = append(out, domain.LodArtifact{
			LOD:      a.LOD,
			Hash:     a.Hash,
			Size:     a.Size,
			Vertices: a.Vertices,
			Faces:    a.Faces,
		})
	}
	slices.SortFunc(out, func(a, b domain.LodArtifact) int {
		switch {
		case a.LOD < b.LOD:
			return -1
		case a.LOD > b.LOD:
			return 1
		default:
			return 0
		}
	})
	return out
}
