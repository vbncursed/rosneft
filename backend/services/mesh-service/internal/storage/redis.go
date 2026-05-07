// Package storage is the Redis Streams adapter for the mesh job queue and
// per-job state hashes. One method per file. This file holds the constructor
// + the stream/group constants and the small key helper that every method
// shares.
package storage

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// Stream and group names used by mesh-api (producer) and mesh-worker (consumer).
const (
	JobsStream    = "rosneft:mesh:jobs"
	ConsumerGroup = "mesh-workers"
	jobKeyPrefix  = "rosneft:mesh:job:"
)

// Redis is the Redis-backed job store and queue.
type Redis struct {
	client *redis.Client
}

// New wraps a redis.Client and ensures the consumer group exists. It is safe
// to call from multiple replicas — XGROUP CREATE with MKSTREAM is idempotent.
func New(ctx context.Context, client *redis.Client) (*Redis, error) {
	r := &Redis{client: client}
	// MKSTREAM lets the group be created before any messages exist.
	err := client.XGroupCreateMkStream(ctx, JobsStream, ConsumerGroup, "$").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return nil, fmt.Errorf("storage.New: create group: %w", err)
	}
	return r, nil
}

func jobKey(id string) string {
	return jobKeyPrefix + id
}
