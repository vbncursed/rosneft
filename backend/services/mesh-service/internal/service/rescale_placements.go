package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// rescaleAfterConvert keeps a territory's existing placements 1:1 with a
// freshly converted replacement mesh. It runs BEFORE the artifacts are
// published so that any failure leaves LOD0 absent and the reconciler re-runs
// the whole job — recovery that would not happen if the rescale ran after the
// mesh landed (the reconciler only re-queues entities missing LOD0). Models
// carry no placements, so it is a no-op for them; the catalog likewise no-ops
// when no rescale baseline is pending.
func (m *Mesh) rescaleAfterConvert(ctx context.Context, kind domain.Kind, slug string, results []domain.ConversionResult) error {
	if kind != domain.KindTerritory || len(results) == 0 {
		return nil
	}
	newMax := bboxMaxAxis(results[0]) // results[0] is LOD0, the full-quality source bbox
	if newMax <= 0 {
		return nil
	}
	if err := m.catalog.RescaleTerritoryPlacements(ctx, slug, newMax); err != nil {
		return fmt.Errorf("rescale placements: %w", err)
	}
	return nil
}

// bboxMaxAxis returns the longest axis-aligned extent of a conversion result's
// source-mesh bbox — the quantity the converter normalizes to max-axis = 2.
func bboxMaxAxis(r domain.ConversionResult) float64 {
	dx := r.BBoxMax.X - r.BBoxMin.X
	dy := r.BBoxMax.Y - r.BBoxMin.Y
	dz := r.BBoxMax.Z - r.BBoxMin.Z
	return max(dx, dy, dz)
}
