package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// GetJob loads a job by ID. Returns domain.ErrJobNotFound if missing.
func (r *Redis) GetJob(ctx context.Context, id string) (domain.Job, error) {
	res, err := r.client.HGetAll(ctx, jobKey(id)).Result()
	if err != nil {
		return domain.Job{}, fmt.Errorf("storage.GetJob: hgetall: %w", err)
	}
	if len(res) == 0 {
		return domain.Job{}, domain.ErrJobNotFound
	}

	j := domain.Job{
		ID:           res["id"],
		Kind:         domain.ParseKind(res["kind"]),
		Slug:         res["slug"],
		Status:       domain.ParseJobStatus(res["status"]),
		ErrorMessage: res["error_message"],
		ArtifactHash: res["artifact_hash"],
	}
	if t, err := time.Parse(time.RFC3339Nano, res["created_at"]); err == nil {
		j.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, res["updated_at"]); err == nil {
		j.UpdatedAt = t
	}
	return j, nil
}
