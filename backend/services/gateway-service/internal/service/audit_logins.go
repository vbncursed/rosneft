package service

import (
	"context"
	"maps"
	"slices"
)

// loginBatch is the largest id list handed to auth in one call. It must stay at
// or below auth's own resolveCap, which refuses anything larger.
//
// The two callers differ in kind, and that is the whole reason this helper
// exists: labelling a page is naturally bounded (a page is at most 200 rows), but
// the actor filter's list is every distinct person who has ever touched a
// company's data — a number with no ceiling that only grows, because the journal
// is append-only. Sizing a cap for the bounded caller and reusing the method for
// the unbounded one meant the filter would start failing at 501 actors and never
// recover.
const loginBatch = 500

// resolveLoginsBatched maps ids to logins in chunks small enough for auth to
// accept, merging the results. Any failure is returned; callers decide whether a
// missing label is worth failing over.
func (g *Gateway) resolveLoginsBatched(ctx context.Context, token string, ids []string) (map[string]string, error) {
	out := make(map[string]string, len(ids))
	for chunk := range slices.Chunk(ids, loginBatch) {
		got, err := g.auth.ResolveUserLogins(ctx, token, chunk)
		if err != nil {
			return nil, err
		}
		maps.Copy(out, got)
	}
	return out, nil
}
