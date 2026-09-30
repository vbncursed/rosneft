package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// TargetLockTTL bounds how long a claimed target stays claimed if the worker
// dies mid-run — and so it is also the recovery time for a dead worker:
// nothing reclaims an orphaned stream message (no XAUTOCLAIM/XCLAIM here), so
// a lapsed claim on a Running job is the only path back to a retry.
//
// markRunning re-takes the claim as the job starts, so the TTL covers one
// conversion and never the queue wait before it. LOD0 of MR1CAMPNEW
// (3 × 8192², textures encoded one at a time) took 357 s on 2026-09-29; a job
// is at most three passes of that size. Half an hour is margin over that
// without leaving a killed worker's target stuck for long.
const TargetLockTTL = 30 * time.Minute

// MaxQueueWait is how long a Pending job counts as queued. The worker reads a
// message only when it has a free slot and marks it Running straight away, so
// a Pending job is one still in the stream, waiting its turn — unless Redis
// failed between the delivery and that write, which leaves it Pending with
// nobody on it. Past this age it is taken for that and the target is queued
// again.
// ponytail: an age cap, not a delivery check; compare the job's stream id with
// the group's last-delivered-id if a queue ever legitimately waits this long.
const MaxQueueWait = 6 * time.Hour

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
