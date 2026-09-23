package service

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// buildModelOptions turns the model list into the picker's options, in the
// list's order (= catalog slug order). Each model already carries its LOD
// chain and LOD0 bounds on the ListModels answer, so the scene costs no
// per-model artifact call.
//
// A model without artifacts stays in the picker (greyed out, empty LODs) so the
// user can re-trigger its conversion: refusing to render the picker because one
// entry is broken is worse UX.
func buildModelOptions(models []domain.Model) []domain.AssetOption {
	options := make([]domain.AssetOption, len(models))
	for i, m := range models {
		options[i] = domain.AssetOption{
			Slug:              m.Slug,
			Title:             m.Title,
			ThumbnailBlobHash: m.ThumbnailBlobHash,
			BBoxMin:           m.BBoxMin,
			BBoxMax:           m.BBoxMax,
			LODs:              nilToEmpty(m.LODs),
		}
	}
	return options
}
