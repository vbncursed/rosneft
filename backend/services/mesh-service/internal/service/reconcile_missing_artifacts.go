package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ReconcileMissingArtifacts queues a conversion for every catalog project that
// does not already have a LOD0 artifact. Idempotent at the catalog level —
// re-running on a fully-converted catalog is a no-op aside from the read pass.
//
// Returns the number of conversions enqueued.
func (m *Mesh) ReconcileMissingArtifacts(ctx context.Context) (int, error) {
	projects, err := m.catalog.ListProjects(ctx)
	if err != nil {
		return 0, fmt.Errorf("service.ReconcileMissingArtifacts: list: %w", err)
	}

	queued := 0
	for _, p := range projects {
		if err := ctx.Err(); err != nil {
			return queued, err
		}
		if _, err := m.catalog.GetArtifact(ctx, p.Slug, 0); err == nil {
			continue
		} else if !errors.Is(err, domain.ErrArtifactNotFound) {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: check %q: %w", p.Slug, err)
		}
		if _, err := m.SubmitConversion(ctx, p.Slug); err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %q: %w", p.Slug, err)
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "project", p.Slug)
		queued++
	}
	return queued, nil
}
