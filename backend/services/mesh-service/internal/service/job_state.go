package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// unlockTarget releases the claim on job's target. Logged
// rather than returned in every caller: failing ProcessJob itself over an
// `UnlockTarget` that didn't land would be worse than the stale key, which
// the TTL clears regardless — and either way ProcessJob's own outcome
// (published artifacts, or a job already marked Failed) is already decided.
func (m *Mesh) unlockTarget(ctx context.Context, job domain.Job) {
	if err := m.queue.UnlockTarget(ctx, job.Kind, job.Slug); err != nil {
		slog.WarnContext(ctx, "process: unlock target failed", "kind", job.Kind, "slug", job.Slug, "err", err)
	}
}

func (m *Mesh) markRunning(ctx context.Context, j *domain.Job) error {
	// The claim restarts with the run: TargetLockTTL bounds the conversion,
	// never the time the job waited in the stream.
	if err := m.queue.HoldTarget(ctx, j.Kind, j.Slug, TargetLockTTL); err != nil {
		return fmt.Errorf("service.ProcessJob: hold: %w", err)
	}
	j.Status = domain.JobStatusRunning
	j.ErrorMessage = ""
	j.FailedOnSource = false
	return m.queue.SaveJob(ctx, *j)
}

func (m *Mesh) markSucceeded(ctx context.Context, j domain.Job) error {
	j.Status = domain.JobStatusSucceeded
	j.ErrorMessage = ""
	j.FailedOnSource = false
	return m.queue.SaveJob(ctx, j)
}

// markFailed records the failure and whether the source's own content caused
// it (domain.ErrBadSource in the chain), which is what the reconciler reads to
// decide between retrying the target and leaving it alone.
func (m *Mesh) markFailed(ctx context.Context, j domain.Job, cause error) error {
	j.Status = domain.JobStatusFailed
	j.ErrorMessage = cause.Error()
	j.FailedOnSource = errors.Is(cause, domain.ErrBadSource)
	return m.queue.SaveJob(ctx, j)
}
