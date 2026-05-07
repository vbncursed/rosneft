package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// GetTarget fetches the catalog entity (territory or model) the worker is
// about to convert. The Kind selects the appropriate gRPC, then we map the
// pb message into a uniform ConversionTarget so the worker code path stays
// kind-agnostic past this point.
func (c *Client) GetTarget(ctx context.Context, kind domain.Kind, slug string) (domain.ConversionTarget, error) {
	switch kind {
	case domain.KindTerritory:
		resp, err := c.cc.GetTerritory(ctx, &catalogv1.GetTerritoryRequest{Slug: slug})
		if err != nil {
			return domain.ConversionTarget{}, fmt.Errorf("catalog.GetTarget territory: %w", mapStatusErr(err, domain.ErrTargetNotFound))
		}
		t := resp.GetTerritory()
		return domain.ConversionTarget{
			Kind:           domain.KindTerritory,
			Slug:           t.GetSlug(),
			Title:          t.GetTitle(),
			Description:    t.GetDescription(),
			SourceBlobHash: t.GetSourceBlobHash(),
		}, nil

	case domain.KindModel:
		resp, err := c.cc.GetModel(ctx, &catalogv1.GetModelRequest{Slug: slug})
		if err != nil {
			return domain.ConversionTarget{}, fmt.Errorf("catalog.GetTarget model: %w", mapStatusErr(err, domain.ErrTargetNotFound))
		}
		m := resp.GetModel()
		return domain.ConversionTarget{
			Kind:           domain.KindModel,
			Slug:           m.GetSlug(),
			Title:          m.GetTitle(),
			Description:    m.GetDescription(),
			SourceBlobHash: m.GetSourceBlobHash(),
		}, nil

	default:
		return domain.ConversionTarget{}, fmt.Errorf("catalog.GetTarget: %w: kind %v", domain.ErrInvalidInput, kind)
	}
}
