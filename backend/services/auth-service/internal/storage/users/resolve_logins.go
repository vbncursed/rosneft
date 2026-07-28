package users

import (
	"context"
	"fmt"
)

// ResolveLogins maps the given user ids to their logins.
//
// Ids that match nothing are simply absent from the result — the journal
// remembers users who have since been deleted, so that is an ordinary outcome.
//
// The comparison casts id to text rather than the parameter to uuid[]: pgx
// would have to infer the array's element type, and a text[] compared against a
// uuid column is exactly the cast that fails with SQLSTATE 22P02. The service
// validates every id before this point, so the cast direction costs nothing but
// removes a way for the query to die on input.
func (s *Store) ResolveLogins(ctx context.Context, ids []string) (map[string]string, error) {
	const q = `SELECT u.id::text, u.username FROM users u WHERE u.id::text = ANY($1)`
	rows, err := s.pool.Query(ctx, q, ids)
	if err != nil {
		return nil, fmt.Errorf("users.ResolveLogins: %w", err)
	}
	defer rows.Close()

	out := make(map[string]string, len(ids))
	for rows.Next() {
		var id, login string
		if err := rows.Scan(&id, &login); err != nil {
			return nil, fmt.Errorf("users.ResolveLogins: scan: %w", err)
		}
		out[id] = login
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.ResolveLogins: rows: %w", err)
	}
	return out, nil
}
