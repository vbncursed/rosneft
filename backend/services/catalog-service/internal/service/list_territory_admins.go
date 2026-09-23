package service

import "context"

// ListTerritoryAdmins returns the admin ids of each of slugs, keyed by slug.
func (c *Catalog) ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error) {
	return c.repo.ListTerritoryAdmins(ctx, slugs)
}
