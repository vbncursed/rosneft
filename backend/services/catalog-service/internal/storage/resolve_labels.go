package storage

import (
	"context"
	"fmt"
	"strconv"
)

// labelQueries is the per-kind lookup.
//
// panoramas is owned by content-service, not catalog. It lives in the same
// shared DB and catalog already reads it read-only to validate placement
// visibility allowlists (see ListPanoramaIDs); naming one of its rows is the
// same kind of read, and it saves the audit path a second client.
var labelQueries = map[string]string{
	"territory": `SELECT id, slug FROM territories WHERE id = ANY($1)`,
	"model":     `SELECT id, slug FROM models WHERE id = ANY($1)`,
	"panorama":  `SELECT id, slug FROM panoramas WHERE id = ANY($1)`,
}

// ResolveLabels names ids per kind, keyed "<kind>:<id>". The service has
// already dropped kinds this map does not carry.
func (r *PG) ResolveLabels(ctx context.Context, byKind map[string][]int64) (map[string]string, error) {
	out := make(map[string]string)
	for kind, ids := range byKind {
		q, ok := labelQueries[kind]
		if !ok {
			continue
		}
		if err := r.collectLabels(ctx, out, kind, q, ids); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (r *PG) collectLabels(ctx context.Context, out map[string]string, kind, q string, ids []int64) error {
	rows, err := r.pool.Query(ctx, q, ids)
	if err != nil {
		return fmt.Errorf("storage.ResolveLabels(%s): %w", kind, err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id   int64
			slug string
		)
		if err := rows.Scan(&id, &slug); err != nil {
			return fmt.Errorf("storage.ResolveLabels(%s): scan: %w", kind, err)
		}
		out[kind+":"+strconv.FormatInt(id, 10)] = slug
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("storage.ResolveLabels(%s): rows: %w", kind, err)
	}
	return nil
}
