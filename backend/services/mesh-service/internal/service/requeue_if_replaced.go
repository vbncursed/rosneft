package service

import (
	"context"
	"errors"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// requeueIfSourceReplaced queues a fresh conversion when the target's source
// was replaced while this job was converting the previous bytes.
//
// runConversion reads the target once, at the top, and SubmitConversion hands
// an in-flight job back to whoever submits during it. A replace-source landing
// mid-conversion therefore used to vanish: the running job published artifacts
// built from the old bytes, HasLOD0 turned true, and the reconciler never
// retried — no error anywhere, and the viewer kept showing the old mesh. The
// claim is released before this runs, so the submit takes a fresh one.
//
// Nothing here fails ProcessJob: the artifacts are published and the job is
// already Succeeded, so the outcome is decided. A target deleted mid-conversion
// is not a failure at all — the reconciler's index sweep forgets it.
func (m *Mesh) requeueIfSourceReplaced(ctx context.Context, job domain.Job, converted string) {
	target, err := m.catalog.GetTarget(ctx, job.Kind, job.Slug)
	if err != nil {
		if errors.Is(err, domain.ErrTargetNotFound) {
			return
		}
		slog.WarnContext(ctx, "process: source re-check failed", "kind", job.Kind, "slug", job.Slug, "err", err)
		return
	}
	if target.SourceBlobHash == converted {
		return
	}
	if _, _, err := m.SubmitConversion(ctx, job.Kind, job.Slug); err != nil {
		slog.WarnContext(ctx, "process: re-queue after source replace failed", "kind", job.Kind, "slug", job.Slug, "err", err)
		return
	}
	slog.InfoContext(ctx, "process: source replaced mid-conversion, re-queued", "kind", job.Kind, "slug", job.Slug)
}
