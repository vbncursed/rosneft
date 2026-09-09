// Package storage is the Redis Streams adapter for the mesh job queue and
// per-job state hashes. One method per file. This file holds the constructor
// + the stream/group constants and the small key helper that every method
// shares.
package storage

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// Stream and group names used by mesh-api (producer) and mesh-worker (consumer).
const (
	JobsStream    = "andrey:mesh:jobs"
	ConsumerGroup = "mesh-workers"
	jobKeyPrefix  = "andrey:mesh:job:"

	// targetsKey is one hash, field "{kind}:{slug}" -> the latest job id for
	// that target. It is what lets the console ask "what is happening to X"
	// without holding a job id; the job hashes themselves stay keyed by id.
	targetsKey = "andrey:mesh:targets"
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

func targetField(kind domain.Kind, slug string) string {
	return fmt.Sprintf("%s:%s", kind, slug)
}
