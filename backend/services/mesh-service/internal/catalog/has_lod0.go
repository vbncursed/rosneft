package catalog

import (
	"context"
	"errors"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// HasLOD0 reports whether the catalog already has a LOD0 artifact for the
// given target, and whether that LOD0 has a plain GLB copy (hasPlain). Used
// by the reconciler to skip already-converted entities and to backfill the
// plain copy. A NotFound response is the negative answer; any other error
// propagates.
func (c *Client) HasLOD0(ctx context.Context, kind domain.Kind, slug string) (has, hasPlain bool, err error) {
	switch kind {
	case domain.KindTerritory:
		resp, err := c.cc.GetTerritoryArtifact(ctx, &catalogv1.GetTerritoryArtifactRequest{TerritorySlug: slug, Lod: 0})
		return classifyHas(err, resp.GetArtifact().GetPlainHash())
	case domain.KindModel:
		resp, err := c.cc.GetModelArtifact(ctx, &catalogv1.GetModelArtifactRequest{ModelSlug: slug, Lod: 0})
		return classifyHas(err, resp.GetArtifact().GetPlainHash())
	default:
		return false, false, fmt.Errorf("catalog.HasLOD0: %w: kind %v", domain.ErrInvalidInput, kind)
	}
}

func classifyHas(err error, plainHash string) (has, hasPlain bool, _ error) {
	if err == nil {
		return true, plainHash != "", nil
	}
	if mapped := mapStatusErr(err, domain.ErrArtifactNotFound); errors.Is(mapped, domain.ErrArtifactNotFound) {
		return false, false, nil
	}
	return false, false, err
}
