package storage

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// SaveJob persists the full job state in a Redis hash keyed by job ID and,
// in the same transaction, points the target index at it — one entry per
// (kind, slug) holding the id of its latest job. The two writes are one
// transaction because a job must never exist without an index entry: the
// gateway's GET /api/jobs reads only the index, so an unindexed job is a
// conversion the console can never show.
// Fields are stored as strings; UpdatedAt is set to time.Now().
func (r *Redis) SaveJob(ctx context.Context, j domain.Job) error {
	fields := saveFields(j, time.Now().UTC())
	// Two keys in one MULTI: single-node Redis, so this is fine. Under a
	// cluster client the same pipeline would be CROSSSLOT unless the keys were
	// hash-tagged into one slot.
	_, err := r.client.TxPipelined(ctx, func(p redis.Pipeliner) error {
		p.HSet(ctx, jobKey(j.ID), fields)
		p.HSet(ctx, targetsKey, targetField(j.Kind, j.Slug), j.ID)
		return nil
	})
	if err != nil {
		return fmt.Errorf("storage.SaveJob: pipeline: %w", err)
	}
	return nil
}

// saveFields is what SaveJob writes for j at now. The backfill mark is written
// only when the job is created (CreatedAt still zero): every later save is a
// worker's or a progress tick's copy, read before a user's submit may have
// cleared the mark (ClearBackfill), and HSET leaves an unlisted field alone.
func saveFields(j domain.Job, now time.Time) map[string]any {
	created := j.CreatedAt.IsZero()
	if created {
		j.CreatedAt = now
	}
	j.UpdatedAt = now
	fields := jobFields(j)
	if !created {
		delete(fields, "backfill")
	}
	return fields
}

// jobFields is the hash representation of j; jobFromHash is its inverse.
func jobFields(j domain.Job) map[string]any {
	return map[string]any{
		"id":               j.ID,
		"kind":             j.Kind.String(),
		"slug":             j.Slug,
		"status":           j.Status.String(),
		"error_message":    j.ErrorMessage,
		"failed_on_source": strconv.FormatBool(j.FailedOnSource),
		"backfill":         strconv.FormatBool(j.Backfill),
		"artifact_hash":    j.ArtifactHash,
		"progress":         strconv.FormatFloat(float64(j.Progress), 'f', 4, 32),
		"stage":            j.Stage,
		"created_at":       j.CreatedAt.Format(time.RFC3339Nano),
		"updated_at":       j.UpdatedAt.Format(time.RFC3339Nano),
	}
}
