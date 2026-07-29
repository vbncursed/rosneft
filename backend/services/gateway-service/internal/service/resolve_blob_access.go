package service

import "context"

// ResolveBlobAccess forwards the asset gate's question to the catalog. No
// business logic here on purpose: the decision is one SQL statement, and
// duplicating any part of it in Go would give two places to keep in step.
func (g *Gateway) ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error) {
	return g.catalog.ResolveBlobAccess(ctx, hash, scopeAdminID)
}
