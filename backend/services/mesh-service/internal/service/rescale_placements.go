package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// rescaleAfterConvert keeps a territory's existing placements, measurements
// and panoramas 1:1 with a freshly converted replacement mesh, passing LOD0's
// source-bbox max axis and center. It runs right AFTER LOD0 is registered
// (and before the other LODs): rescaling first left placements moved for a mesh
// that never got published when the blob put or registration failed. Now a
// failed publish leaves the placements on the old mesh's scale, and a failure
// or worker death after it is retried by the reconciler
// (ReconcileMissingArtifacts, failed or abandoned jobs on a converted target). The retry is safe: the
// catalog applies a pending baseline once and clears it, so a repeat call is
// its documented no-op. Models carry no placements, so it is a no-op for
// them.
func (m *Mesh) rescaleAfterConvert(
	ctx context.Context,
	kind domain.Kind,
	slug string,
	results []domain.ConversionResult,
) error {
	if kind != domain.KindTerritory || len(results) == 0 {
		return nil
	}
	newMax := bboxMaxAxis(results[0]) // results[0] is LOD0, the full-quality source bbox
	if newMax <= 0 {
		return nil
	}
	if err := m.catalog.RescaleTerritoryPlacements(ctx, slug, newMax, bboxCenter(results[0])); err != nil {
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

// bboxCenter returns the center of a conversion result's source-mesh bbox —
// the point the converter moves to the origin before scaling.
func bboxCenter(r domain.ConversionResult) domain.Vec3 {
	return domain.Vec3{
		X: (r.BBoxMin.X + r.BBoxMax.X) / 2,
		Y: (r.BBoxMin.Y + r.BBoxMax.Y) / 2,
		Z: (r.BBoxMin.Z + r.BBoxMax.Z) / 2,
	}
}
