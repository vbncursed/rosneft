package storage

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// SaveJob persists the full job state in a Redis hash keyed by job ID.
// Fields are stored as strings; UpdatedAt is set to time.Now().
func (r *Redis) SaveJob(ctx context.Context, j domain.Job) error {
	now := time.Now().UTC()
	if j.CreatedAt.IsZero() {
		j.CreatedAt = now
	}
	j.UpdatedAt = now

	fields := map[string]any{
		"id":            j.ID,
		"kind":          j.Kind.String(),
		"slug":          j.Slug,
		"status":        j.Status.String(),
		"error_message": j.ErrorMessage,
		"artifact_hash": j.ArtifactHash,
		"progress":      strconv.FormatFloat(float64(j.Progress), 'f', 4, 32),
		"stage":         j.Stage,
		"created_at":    j.CreatedAt.Format(time.RFC3339Nano),
		"updated_at":    j.UpdatedAt.Format(time.RFC3339Nano),
	}
	if err := r.client.HSet(ctx, jobKey(j.ID), fields).Err(); err != nil {
		return fmt.Errorf("storage.SaveJob: hset: %w", err)
	}
	return nil
}
