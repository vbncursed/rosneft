package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritories returns territories ordered by slug. When scopeAdminID is
// non-empty, only territories assigned to that admin are returned; empty means
// no filter (Root and internal callers see everything). withArtifacts attaches
// each territory's LOD chain (one extra query for the whole list); only the
// callers that render the chain ask for it.
func (r *PG) ListTerritories(ctx context.Context, scopeAdminID string, withArtifacts bool) ([]domain.Territory, error) {
	const q = `SELECT t.slug, t.title, t.description, t.source_blob_hash, t.external_panorama_url, t.created_at, t.updated_at,
       (SELECT COUNT(*) FROM placements p WHERE p.territory_id = t.id) AS placement_count
FROM territories t
WHERE ($1 = '' OR EXISTS (
    SELECT 1 FROM territory_assignments a
    WHERE a.territory_id = t.id AND a.admin_user_id = $1::uuid))
ORDER BY t.slug`

	rows, err := r.pool.Query(ctx, q, scopeAdminID)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: query: %w", err)
	}
	defer rows.Close()

	// 32 territories covers the typical catalog without realloc;
	// the slice will grow naturally if the catalog gets larger.
	out := make([]domain.Territory, 0, 32)
	for rows.Next() {
		t, err := scanTerritoryListed(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListTerritories: scan: %w", err)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: iter: %w", err)
	}
	if !withArtifacts {
		return out, nil
	}

	slugs := make([]string, len(out))
	for i, row := range out {
		slugs[i] = row.Slug
	}
	chains, err := r.artifactsBySlug(ctx, territoryArtifactsBySlug, slugs)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: %w", err)
	}
	for i := range out {
		out[i].Artifacts = chains[out[i].Slug]
	}
	return out, nil
}
