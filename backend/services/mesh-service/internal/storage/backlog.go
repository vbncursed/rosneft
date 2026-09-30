package storage

import (
	"context"
	"errors"
	"fmt"
)

// Backlog is how many stream entries the consumer group has not yet been
// handed: the queue's real depth, whatever the batch size of a read. Entries
// delivered but not acked are the ones running (or orphaned), not waiting.
func (r *Redis) Backlog(ctx context.Context) (int64, error) {
	groups, err := r.client.XInfoGroups(ctx, JobsStream).Result()
	if err != nil {
		return 0, fmt.Errorf("storage.Backlog: xinfo groups: %w", err)
	}
	for _, g := range groups {
		if g.Name != ConsumerGroup {
			continue
		}
		// Redis reports lag as unknown (-1 here) after an XDEL inside the
		// undelivered range; nothing deletes from this stream, so it is an error.
		if g.Lag < 0 {
			return 0, errors.New("storage.Backlog: lag unknown")
		}
		return g.Lag, nil
	}
	return 0, fmt.Errorf("storage.Backlog: group %q not found", ConsumerGroup)
}
