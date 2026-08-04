package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// ReconcileLockTTL bounds how long a claimed target stays claimed if the
// worker dies between claiming it and finishing — it is also, therefore, the
// recovery time for a dead worker: nothing else reclaims an orphaned stream
// message (no XAUTOCLAIM/XCLAIM anywhere in this service), so this TTL is the
// sole path back to a queued retry.
//
// Measured against production Prometheus on 2026-08-03, 15-day window, from
// the cumulative bucket counts of mesh_conversion_duration_seconds (count=60,
// sum=1424.18s, mean≈23.7s): le=1 → 15, le=5 → 16, le=15 → 23, le=30 → 36,
// le=60 → 60 (every observation). All 60 conversions therefore completed
// within the le=60 bucket, with 36 of them under 30s; the slowest fell
// somewhere in (30s, 60s] — a classic histogram can't say where inside a
// bucket, only that 60s bounds it from above. 10 minutes is still a tenfold
// margin over that 60s bound — comfortable headroom without leaving a dead
// worker's target stuck for half an hour.
const ReconcileLockTTL = 10 * time.Minute

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
		// HasLOD0 stays false for the entire conversion — the artifact is
		// published last — so without this claim a conversion longer than the
		// tick interval is queued again on every tick, and with two workers
		// the duplicate runs concurrently against the same territory.
		locked, err := m.queue.TryLockTarget(ctx, t.Kind, t.Slug, ReconcileLockTTL)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: lock %s/%s: %w", t.Kind, t.Slug, err)
		}
		if !locked {
			continue
		}
		if _, err := m.SubmitConversion(ctx, t.Kind, t.Slug); err != nil {
			// Release rather than wait out the TTL: retrying is this loop's
			// entire purpose.
			_ = m.queue.UnlockTarget(ctx, t.Kind, t.Slug)
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %s/%s: %w", t.Kind, t.Slug, err)
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "kind", t.Kind, "slug", t.Slug)
		queued++
	}
	return queued, nil
}
