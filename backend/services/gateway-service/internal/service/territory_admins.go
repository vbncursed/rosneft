package service

import "context"

// SetTerritoryAdmins replaces a territory's assigned-admin set (Root-only at the
// transport layer).
func (g *Gateway) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	return g.catalog.SetTerritoryAdmins(ctx, slug, adminIDs)
}

// GetTerritoryAdmins returns the admin user ids assigned to a territory.
func (g *Gateway) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	return g.catalog.GetTerritoryAdmins(ctx, slug)
}
