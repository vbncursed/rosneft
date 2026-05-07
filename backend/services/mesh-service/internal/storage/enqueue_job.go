package storage

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// EnqueueJob publishes a job ID onto the conversion stream. The full job state
// must already be saved via SaveJob — workers fetch state by ID.
func (r *Redis) EnqueueJob(ctx context.Context, jobID string) error {
	_, err := r.client.XAdd(ctx, &redis.XAddArgs{
		Stream: JobsStream,
		Values: map[string]any{"job_id": jobID},
	}).Result()
	if err != nil {
		return fmt.Errorf("storage.EnqueueJob: xadd: %w", err)
	}
	return nil
}
