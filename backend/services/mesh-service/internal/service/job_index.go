package service

import (
	"context"
	"log/slog"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// anyLive reports whether the index holds a job that is still waiting for or
// holding the worker. An index read error counts as busy: skipping a backfill
// for one tick costs nothing.
func anyLive(ctx context.Context, index func() ([]domain.Job, error), live func(domain.Job) bool) bool {
	jobs, err := index()
	if err != nil {
		slog.WarnContext(ctx, "reconcile: index read failed", "err", err)
		return true
	}
	return slices.ContainsFunc(jobs, live)
}

// liveNow is queued (Pending, younger than MaxQueueWait) or Running with a
// write inside TargetLockTTL; past that its worker is gone.
func (m *Mesh) liveNow(j domain.Job) bool {
	return m.queued(j) || j.Status == domain.JobStatusRunning && m.now().Sub(j.UpdatedAt) < TargetLockTTL
}

func targetKey(kind domain.Kind, slug string) string {
	return kind.String() + ":" + slug
}

// latestJobs is the index keyed by target. An index read error yields an
// empty map, so the tick retries as before.
func latestJobs(ctx context.Context, index func() ([]domain.Job, error)) map[string]domain.Job {
	jobs, err := index()
	if err != nil {
		slog.WarnContext(ctx, "reconcile: index read failed", "err", err)
		return map[string]domain.Job{}
	}
	out := make(map[string]domain.Job, len(jobs))
	for _, j := range jobs {
		out[targetKey(j.Kind, j.Slug)] = j
	}
	return out
}
