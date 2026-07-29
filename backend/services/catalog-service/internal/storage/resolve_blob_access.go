package storage

import (
	"context"
	"fmt"
)

// ResolveBlobAccess reports whether a caller scoped to scopeAdminID may read the
// bytes behind a content-addressed hash.
//
// A blob has no single owner — the hash addresses content and is deduplicated
// across territories and models — so the question cannot be answered by the
// territory gate. It is answered here instead: the hash is reachable when it
// belongs to a model (a shared library, deliberately readable by everyone) or to
// a territory assigned to the caller.
//
// An empty scopeAdminID disables the filter, matching GetTerritory and every
// other scoped query here. That means "Root", NOT "nobody" — a caller without a
// scope must be refused before reaching this function.
//
// Panoramas and territory_documents are owned by content-service. Reading them
// here mirrors ListPanoramaIDs: same shared database, read-only, and the
// alternative is a second RPC on the hot path of every asset request.
//
// Added a table with a hash column? Add a branch here and a case to
// resolve_blob_access_integration_test.go, or the new asset type is either
// reachable by nobody or by everybody — and nothing else will notice.
func (r *PG) ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error) {
	// EXISTS over UNION ALL stops at the first matching row, so the six branches
	// are not six scans. Models come first because in a typical scene most asset
	// requests are placement GLBs.
	const q = `
SELECT EXISTS (
    SELECT 1 FROM model_artifacts WHERE hash = $1
    UNION ALL
    SELECT 1 FROM models WHERE source_blob_hash = $1 OR thumbnail_blob_hash = $1
    UNION ALL
    SELECT 1 FROM territory_artifacts ta
      WHERE ta.hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = ta.territory_id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM territories t
      WHERE t.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = t.id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM panoramas p
      WHERE p.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = p.territory_id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM territory_documents d
      WHERE d.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = d.territory_id AND a.admin_user_id = $2::uuid))
)`

	var allowed bool
	if err := r.pool.QueryRow(ctx, q, hash, scopeAdminID).Scan(&allowed); err != nil {
		return false, fmt.Errorf("storage.ResolveBlobAccess: %w", err)
	}
	return allowed, nil
}
