package catalog

import (
	"context"
	"errors"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// HasLOD0 reports whether the catalog already has a LOD0 artifact for the
// given target. Used by the reconciler to skip already-converted entities.
// A NotFound response is the negative answer; any other error propagates.
func (c *Client) HasLOD0(ctx context.Context, kind domain.Kind, slug string) (bool, error) {
	switch kind {
	case domain.KindTerritory:
		_, err := c.cc.GetTerritoryArtifact(ctx, &catalogv1.GetTerritoryArtifactRequest{TerritorySlug: slug, Lod: 0})
		return classifyHas(err)
	case domain.KindModel:
		_, err := c.cc.GetModelArtifact(ctx, &catalogv1.GetModelArtifactRequest{ModelSlug: slug, Lod: 0})
		return classifyHas(err)
	default:
		return false, fmt.Errorf("catalog.HasLOD0: %w: kind %v", domain.ErrInvalidInput, kind)
	}
}

func classifyHas(err error) (bool, error) {
	if err == nil {
		return true, nil
	}
	if mapped := mapStatusErr(err, domain.ErrArtifactNotFound); errors.Is(mapped, domain.ErrArtifactNotFound) {
		return false, nil
	}
	return false, err
}
