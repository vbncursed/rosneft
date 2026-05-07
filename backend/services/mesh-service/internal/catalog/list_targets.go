package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ListTargets returns every territory and every model as ConversionTarget
// values in one flat list. Used by the reconciler to walk every catalog
// entity and queue conversions for those without a LOD0 artifact.
func (c *Client) ListTargets(ctx context.Context) ([]domain.ConversionTarget, error) {
	out := make([]domain.ConversionTarget, 0)

	tr, err := c.cc.ListTerritories(ctx, &catalogv1.ListTerritoriesRequest{})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTargets territories: %w", err)
	}
	for _, t := range tr.GetTerritories() {
		out = append(out, domain.ConversionTarget{
			Kind:           domain.KindTerritory,
			Slug:           t.GetSlug(),
			Title:          t.GetTitle(),
			Description:    t.GetDescription(),
			SourceBlobHash: t.GetSourceBlobHash(),
		})
	}

	mr, err := c.cc.ListModels(ctx, &catalogv1.ListModelsRequest{})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTargets models: %w", err)
	}
	for _, m := range mr.GetModels() {
		out = append(out, domain.ConversionTarget{
			Kind:           domain.KindModel,
			Slug:           m.GetSlug(),
			Title:          m.GetTitle(),
			Description:    m.GetDescription(),
			SourceBlobHash: m.GetSourceBlobHash(),
		})
	}

	return out, nil
}
