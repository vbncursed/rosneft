package service

import (
	"context"
	"fmt"
	"log/slog"
)

// ReconcileMissingArtifacts queues a conversion for every catalog target
// (territory or model) that does not already have a LOD0 artifact.
// Idempotent at the catalog level — re-running on a fully-converted catalog
// is a no-op aside from the read pass.
//
// Returns the number of conversions enqueued.
func (m *Mesh) ReconcileMissingArtifacts(ctx context.Context) (int, error) {
	targets, err := m.catalog.ListTargets(ctx)
	if err != nil {
		return 0, fmt.Errorf("service.ReconcileMissingArtifacts: list: %w", err)
	}

	queued := 0
	for _, t := range targets {
		if err := ctx.Err(); err != nil {
			return queued, err
		}
		has, err := m.catalog.HasLOD0(ctx, t.Kind, t.Slug)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: check %s/%s: %w", t.Kind, t.Slug, err)
		}
		if has {
			continue
		}
		if _, err := m.SubmitConversion(ctx, t.Kind, t.Slug); err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %s/%s: %w", t.Kind, t.Slug, err)
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "kind", t.Kind, "slug", t.Slug)
		queued++
	}
	return queued, nil
}
