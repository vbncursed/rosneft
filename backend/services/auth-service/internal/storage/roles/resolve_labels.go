package roles

import (
	"context"
	"fmt"
)

// labelQueries is the per-kind lookup. A role's label is its title, which is
// what a human named it; the slug is the fallback for a row whose title was
// never filled in. A permission has no title — its slug (`audit:read`) is the
// name people use for it.
//
// The comparison casts id to text rather than the parameter to uuid[]: pgx
// would have to infer the array's element type, and a text[] compared against a
// uuid column is exactly the cast that fails with SQLSTATE 22P02.
var labelQueries = map[string]string{
	"role":       `SELECT id::text, COALESCE(NULLIF(title, ''), slug) FROM roles WHERE id::text = ANY($1)`,
	"permission": `SELECT id::text, slug FROM permissions WHERE id::text = ANY($1)`,
}

// ResolveLabels names ids per kind, keyed "<kind>:<uuid>". The service has
// already validated every id and dropped kinds this map does not carry.
func (s *Store) ResolveLabels(ctx context.Context, byKind map[string][]string) (map[string]string, error) {
	out := make(map[string]string)
	for kind, ids := range byKind {
		q, ok := labelQueries[kind]
		if !ok {
			continue
		}
		if err := s.collectLabels(ctx, out, kind, q, ids); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Store) collectLabels(ctx context.Context, out map[string]string, kind, q string, ids []string) error {
	rows, err := s.pool.Query(ctx, q, ids)
	if err != nil {
		return fmt.Errorf("roles.ResolveLabels(%s): %w", kind, err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, label string
		if err := rows.Scan(&id, &label); err != nil {
			return fmt.Errorf("roles.ResolveLabels(%s): scan: %w", kind, err)
		}
		out[kind+":"+id] = label
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("roles.ResolveLabels(%s): rows: %w", kind, err)
	}
	return nil
}
