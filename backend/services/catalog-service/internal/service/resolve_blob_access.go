package service

import "context"

// ResolveBlobAccess forwards the asset gate's question to storage.
//
// No logic here on purpose: the decision is one SQL statement, and re-deriving
// any part of it in Go would give two places to keep in step — with the failure
// mode being a silent grant.
func (c *Catalog) ResolveBlobAccess(ctx context.Context, hash, scopeAdminID string) (bool, error) {
	return c.repo.ResolveBlobAccess(ctx, hash, scopeAdminID)
}
