package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// TargetLockTTL bounds how long a claimed target stays claimed if the
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
const TargetLockTTL = 10 * time.Minute

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
		// published last — so without the claim SubmitConversion takes, a
		// conversion longer than the tick interval would be queued again on
		// every tick.
		// SubmitConversion holds the target claim; when the target is already
		// in flight it hands back that job and created is false.
		_, created, err := m.SubmitConversion(ctx, t.Kind, t.Slug)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %s/%s: %w", t.Kind, t.Slug, err)
		}
		if !created {
			continue
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "kind", t.Kind, "slug", t.Slug)
		queued++
	}
	m.sweepIndex(ctx, targets)
	return queued, nil
}

// sweepIndex drops index entries for targets the catalog no longer lists —
// a deleted territory or model otherwise keeps its last job in GET /api/jobs
// forever. Errors are logged, not returned: the queueing half of the tick
// already happened, and the next tick sweeps again.
func (m *Mesh) sweepIndex(ctx context.Context, targets []domain.ConversionTarget) {
	live := make(map[string]struct{}, len(targets))
	for _, t := range targets {
		live[t.Kind.String()+":"+t.Slug] = struct{}{}
	}
	jobs, err := m.queue.ListTargetJobs(ctx)
	if err != nil {
		slog.WarnContext(ctx, "reconcile: index read failed", "err", err)
		return
	}
	for _, j := range jobs {
		if _, ok := live[j.Kind.String()+":"+j.Slug]; ok {
			continue
		}
		if err := m.queue.ForgetTarget(ctx, j.Kind, j.Slug); err != nil {
			slog.WarnContext(ctx, "reconcile: forget target failed", "kind", j.Kind, "slug", j.Slug, "err", err)
			continue
		}
		slog.InfoContext(ctx, "reconcile: forgot deleted target", "kind", j.Kind, "slug", j.Slug)
	}
}
