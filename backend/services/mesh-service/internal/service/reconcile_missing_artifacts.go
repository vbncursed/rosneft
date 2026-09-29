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
// The claim is taken at submit, so it has to outlive the queue wait as well
// as the conversion. The 2026-08-03 production histogram of
// mesh_conversion_duration_seconds bounded every conversion under 60s, and
// 10 minutes was sized against that. Encoding textures one at a time
// (gltfpack -tj 1, the fix for the OOM on 8192² textures) changed the scale:
// LOD0 of MR1CAMPNEW (3 × 8192²) alone took 357s on 2026-09-29, before its two
// LOD passes, and with one job per worker the next target waits behind it. A
// claim that lapses mid-run lets the next reconciler tick queue a duplicate
// ~4 GB conversion. An hour covers a few such conversions queued ahead; the
// price is that a dead worker's target waits up to an hour for its retry.
const TargetLockTTL = time.Hour

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
//
// It deletes against the targets snapshot taken at the start of this tick, so
// a target created mid-loop whose own submit already indexed it can be
// HDEL'd here once. That's safe: SaveJob re-HSETs the index field on every
// write (progress and terminal alike), so the entry reappears the moment the
// worker writes to it again.
func (m *Mesh) sweepIndex(ctx context.Context, targets []domain.ConversionTarget) {
	// A context cancelled between the loop finishing and here (typically
	// shutdown racing the tick) would otherwise reach ListTargetJobs and log
	// a Warn on every graceful shutdown; skip the sweep instead.
	if ctx.Err() != nil {
		return
	}
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
