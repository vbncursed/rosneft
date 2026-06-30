package users

import (
	"context"
	"fmt"
)

// ResolveOwningAdmin walks the created_by chain upward from userID and returns
// the owning admin id (see pickOwningAdmin). Empty for a Root. The depth guard
// caps the walk in case created_by data ever contains a cycle.
func (s *Store) ResolveOwningAdmin(ctx context.Context, userID string) (string, error) {
	const q = `
WITH RECURSIVE chain AS (
    SELECT id, created_by, is_owner, 0 AS depth
    FROM users WHERE id = $1
    UNION ALL
    SELECT u.id, u.created_by, u.is_owner, c.depth + 1
    FROM users u JOIN chain c ON u.id = c.created_by
    WHERE c.depth < 64
)
SELECT id, is_owner FROM chain ORDER BY depth`

	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return "", fmt.Errorf("users.ResolveOwningAdmin: query: %w", err)
	}
	defer rows.Close()

	chain := make([]ChainNode, 0, 8)
	for rows.Next() {
		var n ChainNode
		if err := rows.Scan(&n.ID, &n.IsOwner); err != nil {
			return "", fmt.Errorf("users.ResolveOwningAdmin: scan: %w", err)
		}
		chain = append(chain, n)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("users.ResolveOwningAdmin: rows: %w", err)
	}
	return pickOwningAdmin(chain), nil
}
