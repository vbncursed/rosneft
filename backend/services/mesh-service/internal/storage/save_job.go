package storage

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// indexJob points a target at its latest job and, in the same step, makes that
// job permanent and starts the retention clock of the job it replaces. HSET
// leaves a TTL alone, so a late save from a superseded job's worker could not
// make it permanent again on its own; PERSIST on the job being indexed is what
// guarantees that whichever job the index points at never carries the expiry
// (a late save of A re-points the index at A, B is expired in its place, and
// B's own next save re-indexes and persists it).
var indexJob = redis.NewScript(`
local old = redis.call("HGET", KEYS[1], ARGV[1])
redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
redis.call("PERSIST", ARGV[3] .. ARGV[2])
if old and old ~= ARGV[2] then redis.call("EXPIRE", ARGV[3] .. old, ARGV[4]) end
return 0`)

// retentionSeconds is JobRetention as the script's argument.
var retentionSeconds = int64(JobRetention / time.Second)

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
		indexJob.Eval(ctx, p, []string{targetsKey}, targetField(j.Kind, j.Slug), j.ID, jobKeyPrefix, retentionSeconds)
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
