package storage

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// EnqueueJob publishes a job ID onto the conversion stream. The full job state
// must already be saved via SaveJob — workers fetch state by ID. The same call
// drops entries older than streamRetention: XACK never removes a message, so
// without it the stream would keep every job ever queued. Exact MINID, not
// "~": it trims the one entry that just aged out, where the approximate form
// waits for a whole macro node.
func (r *Redis) EnqueueJob(ctx context.Context, jobID string) error {
	_, err := r.client.XAdd(ctx, &redis.XAddArgs{
		Stream: JobsStream,
		MinID:  strconv.FormatInt(time.Now().Add(-streamRetention).UnixMilli(), 10),
		Values: map[string]any{"job_id": jobID},
	}).Result()
	if err != nil {
		return fmt.Errorf("storage.EnqueueJob: xadd: %w", err)
	}
	return nil
}
