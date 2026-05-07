package storage

import (
	"context"
	"fmt"
)

// AckJob acknowledges a stream message so it is no longer redelivered.
// Call only after the job has been fully processed and persisted.
func (r *Redis) AckJob(ctx context.Context, messageID string) error {
	if err := r.client.XAck(ctx, JobsStream, ConsumerGroup, messageID).Err(); err != nil {
		return fmt.Errorf("storage.AckJob: xack: %w", err)
	}
	return nil
}
