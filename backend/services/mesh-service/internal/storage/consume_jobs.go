package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// DeliveredJob is one stream entry pulled by the consumer. The caller MUST
// call AckJob with MessageID once the job has been fully processed.
type DeliveredJob struct {
	MessageID string
	JobID     string
}

// ConsumeJobs blocks reading from the conversion stream as part of the
// consumer group. It blocks for up to `block` per call. On ctx cancellation
// it returns a nil-error empty slice so callers can shut down cleanly.
func (r *Redis) ConsumeJobs(ctx context.Context, consumer string, block time.Duration) ([]DeliveredJob, error) {
	res, err := r.client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    ConsumerGroup,
		Consumer: consumer,
		Streams:  []string{JobsStream, ">"},
		// One message per free slot (worker.Run acquires the slot first): a
		// message read is started at once, so a job still waiting stays in the
		// stream where any live worker can take it, never parked in the PEL of
		// a worker that may be killed before reaching it.
		Count: 1,
		Block: block,
	}).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, nil
		}
		return nil, fmt.Errorf("storage.ConsumeJobs: xreadgroup: %w", err)
	}

	out := make([]DeliveredJob, 0)
	for _, stream := range res {
		for _, msg := range stream.Messages {
			id, _ := msg.Values["job_id"].(string)
			if id == "" {
				continue
			}
			out = append(out, DeliveredJob{MessageID: msg.ID, JobID: id})
		}
	}
	return out, nil
}
