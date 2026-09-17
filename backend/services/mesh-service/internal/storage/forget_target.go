package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ForgetTarget removes the target's index entry. HDEL of a missing field is
// not an error, so a sweep that races another replica's sweep is fine. The
// job hash is left alone: GetJob by id keeps answering.
func (r *Redis) ForgetTarget(ctx context.Context, kind domain.Kind, slug string) error {
	if err := r.client.HDel(ctx, targetsKey, targetField(kind, slug)).Err(); err != nil {
		return fmt.Errorf("storage.ForgetTarget: hdel: %w", err)
	}
	return nil
}
