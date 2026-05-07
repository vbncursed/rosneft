package service

import (
	"context"
	"fmt"
)

// UpdateProgress patches the job's progress + stage and persists. Called
// by the worker at coarse conversion-stage boundaries (fetch / extract /
// parse / encode / compress / lod-N / register). Errors are logged-and-
// swallowed by the worker — losing one progress tick is harmless, and we
// don't want a transient Redis blip to fail the actual conversion.
func (m *Mesh) UpdateProgress(ctx context.Context, jobID string, progress float32, stage string) error {
	j, err := m.queue.GetJob(ctx, jobID)
	if err != nil {
		return fmt.Errorf("service.UpdateProgress: load: %w", err)
	}
	j.Progress = progress
	j.Stage = stage
	if err := m.queue.SaveJob(ctx, j); err != nil {
		return fmt.Errorf("service.UpdateProgress: save: %w", err)
	}
	return nil
}
