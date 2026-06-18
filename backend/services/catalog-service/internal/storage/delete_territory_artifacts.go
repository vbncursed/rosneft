package storage

import (
	"context"
	"fmt"
)

// DeleteTerritoryArtifacts removes every LOD artifact of a territory. An
// unknown slug matches no rows and is a no-op — callers reset-then-reconvert,
// so "already absent" is success, not an error.
func (r *PG) DeleteTerritoryArtifacts(ctx context.Context, slug string) error {
	const q = `
		DELETE FROM territory_artifacts
		WHERE territory_id = (SELECT id FROM territories WHERE slug = $1)`

	if _, err := r.pool.Exec(ctx, q, slug); err != nil {
		return fmt.Errorf("storage.DeleteTerritoryArtifacts: %w", err)
	}
	return nil
}
