package storage

import (
	"context"
	"fmt"
)

// ClearBackfill drops the job's backfill mark (domain.Job.Backfill). One
// field, so it never rewinds the status or progress a worker wrote meanwhile,
// and SaveJob writes the mark only on create, so no later save restores it.
func (r *Redis) ClearBackfill(ctx context.Context, id string) error {
	if err := r.client.HSet(ctx, jobKey(id), "backfill", "false").Err(); err != nil {
		return fmt.Errorf("storage.ClearBackfill: hset: %w", err)
	}
	return nil
}
