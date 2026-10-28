package service

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
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

// BackfillRetryAfter is how long a plain-copy backfill waits after its latest
// job finished without leaving a plain copy. The worker pokes the reconciler
// after every successful job, so without it one target that fails for
// infrastructure reasons would be tried first on every such pass, and a
// catalog that drops plain_hash would reconvert back to back forever.
const BackfillRetryAfter = 5 * time.Minute

// ReconcileMissingArtifacts queues a conversion for every catalog target
// (territory or model) that does not already have a LOD0 artifact, or whose
// LOD0 has no plain GLB copy (the backfill for targets converted before the
// compatible export existed: the ordinary job writes the copy). The backfill
// goes one target per pass and only while no other job is live; a pass runs
// every tick and right after each successful job.
// Idempotent at the catalog level — re-running on a fully-converted catalog
// is a no-op aside from the read pass.
//
// A target whose latest job failed on its input (Job.FailedOnSource: an
// archive past the extraction cap, no .obj inside) is left alone: the same
// bytes fail the same way, so re-queuing it every tick only churns the index
// and the worker. Replacing the source does not wait for this tick: the
// gateway calls SubmitConversion right after swapping the hash, and that never
// consults the failed job, so such a target is not stranded.
//
// A converted target is also re-queued when its latest job failed for a
// reason that is not the input's, was not a hidden backfill, and is
// BackfillRetryAfter old, or is Running with no write inside TargetLockTTL (its
// worker died): a replace-source conversion that died after LOD0 was published
// has LOD0 and a plain copy, so HasLOD0 alone would never retry it, and
// placements may wait on the rescale that job owed. A death before publishing
// is the "no lod0" branch: the gateway deletes the old artifacts on replace.
//
// Trade-off: only input failures are skipped. Infrastructure failures (worker
// killed mid-job, Redis or catalog blip) keep the old self-healing retry, and
// so does a job saved before FailedOnSource existed.
// ponytail: a job does not record its source blob. If a
// replace-source's own submit fails after the hash swap, the target waits for
// a retry of the replace; store the source on the job to retry it here.
//
// Returns the number of conversions enqueued.
func (m *Mesh) ReconcileMissingArtifacts(ctx context.Context) (int, error) {
	targets, err := m.catalog.ListTargets(ctx)
	if err != nil {
		return 0, fmt.Errorf("service.ReconcileMissingArtifacts: list: %w", err)
	}

	// One index read per pass, taken on first need and shared with the sweep.
	index := sync.OnceValues(func() ([]domain.Job, error) { return m.queue.ListTargetJobs(ctx) })
	var latest map[string]domain.Job

	queued, skewed := 0, false
	for _, t := range targets {
		if err := ctx.Err(); err != nil {
			return queued, err
		}
		has, hasPlain, err := m.catalog.HasLOD0(ctx, t.Kind, t.Slug)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: check %s/%s: %w", t.Kind, t.Slug, err)
		}
		if latest == nil {
			latest = latestJobs(ctx, index)
		}
		last, seen := latest[targetKey(t.Kind, t.Slug)]
		if seen && last.Status == domain.JobStatusFailed && last.FailedOnSource {
			continue
		}
		if has && hasPlain && !m.replaceFailed(last, seen) {
			continue
		}
		reason := "no lod0"
		if has && hasPlain {
			reason = "failed replace"
		} else if has {
			reason = "no plain copy"
			// ponytail: one backfill per pass, and only on an idle worker, so
			// an upload never queues behind the whole catalog and no queued
			// backfill outlives MaxQueueWait (which would queue it twice).
			// The worker also runs a pass right after every successful job,
			// so a succeeding backlog drains back to back: ceiling is one
			// conversion per target (~1 min each), not 12 targets an hour.
			// Targets whose latest job failed wait BackfillRetryAfter, so
			// only a success drains at once.
			if queued > 0 || skewed || anyLive(ctx, index, m.liveNow) {
				continue
			}
			if seen && m.now().Sub(last.UpdatedAt) < BackfillRetryAfter {
				// Every conversion writes the plain copy, so one that just
				// succeeded without it means the catalog drops plain_hash
				// (an older image): its success signal would reconvert back
				// to back forever. Stop the drain for this pass; the skew
				// then costs one reconversion per tick, as before the drain.
				skewed = last.Status == domain.JobStatusSucceeded
				if skewed || last.Status == domain.JobStatusFailed {
					continue
				}
			}
		}
		// SubmitConversion holds the target claim; when the target is already
		// in flight it hands back that job and created is false.
		// Only the plain-copy backfill is marked (Job.Backfill hides its
		// failure). A first conversion (no LOD0) is not, nor a retry of a job
		// that neither succeeded nor was a backfill: that is a failed or
		// abandoned replace-source, converting bytes the LOD0 is not built from.
		backfill := has && (!seen || last.Status == domain.JobStatusSucceeded || last.Backfill)
		_, created, err := m.submit(ctx, t.Kind, t.Slug, backfill)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %s/%s: %w", t.Kind, t.Slug, err)
		}
		if !created {
			continue
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "kind", t.Kind, "slug", t.Slug, "reason", reason)
		queued++
	}
	m.sweepIndex(ctx, targets, index)
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
func (m *Mesh) sweepIndex(ctx context.Context, targets []domain.ConversionTarget, index func() ([]domain.Job, error)) {
	// A context cancelled between the loop finishing and here (typically
	// shutdown racing the tick) would otherwise reach ListTargetJobs and log
	// a Warn on every graceful shutdown; skip the sweep instead.
	if ctx.Err() != nil {
		return
	}
	live := make(map[string]struct{}, len(targets))
	for _, t := range targets {
		live[targetKey(t.Kind, t.Slug)] = struct{}{}
	}
	jobs, err := index()
	if err != nil {
		slog.WarnContext(ctx, "reconcile: index read failed", "err", err)
		return
	}
	for _, j := range jobs {
		if _, ok := live[targetKey(j.Kind, j.Slug)]; ok {
			continue
		}
		if err := m.queue.ForgetTarget(ctx, j.Kind, j.Slug); err != nil {
			slog.WarnContext(ctx, "reconcile: forget target failed", "kind", j.Kind, "slug", j.Slug, "err", err)
			continue
		}
		slog.InfoContext(ctx, "reconcile: forgot deleted target", "kind", j.Kind, "slug", j.Slug)
	}
}

// replaceFailed reports whether a converted target's latest job is a failed,
// user-visible conversion old enough to retry, or a Running one whose worker is
// gone (no write inside TargetLockTTL: killed after LOD0 was registered, before
// the rescale). Backfills are excluded (their failure is hidden and has its own
// retry path) and so is a fresh failure, so a persistent infrastructure error
// costs one job per BackfillRetryAfter. submit re-queues the abandoned Running
// job once its claim has lapsed; a live one keeps its claim and is not touched.
func (m *Mesh) replaceFailed(last domain.Job, seen bool) bool {
	if !seen || last.Backfill {
		return false
	}
	switch last.Status {
	case domain.JobStatusFailed:
		return m.now().Sub(last.UpdatedAt) >= BackfillRetryAfter
	case domain.JobStatusRunning:
		return m.now().Sub(last.UpdatedAt) >= TargetLockTTL
	default:
		return false
	}
}
