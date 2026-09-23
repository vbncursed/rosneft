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

// ListTerritoryAdmins returns the admin ids of every territory visible to the
// scope authhttp.Scope resolved, keyed by slug: the set GET /api/territories
// lists. A territory nobody is assigned to maps to [], never to a missing key.
// It fails closed: a scoped caller with no admin id sees nothing, because the
// catalog reads an empty scope as every territory.
func (g *Gateway) ListTerritoryAdmins(ctx context.Context, scopeAdminID string, allAccess bool) (map[string][]string, error) {
	if !allAccess && scopeAdminID == "" {
		return map[string][]string{}, nil
	}
	territories, err := g.catalog.ListTerritories(ctx, scopeAdminID, false)
	if err != nil {
		return nil, err
	}
	if len(territories) == 0 {
		return map[string][]string{}, nil
	}
	slugs := make([]string, len(territories))
	for i, t := range territories {
		slugs[i] = t.Slug
	}
	assigned, err := g.catalog.ListTerritoryAdmins(ctx, slugs)
	if err != nil {
		return nil, err
	}
	out := make(map[string][]string, len(slugs))
	for _, slug := range slugs {
		// Not slices.Clone: it keeps nil, and nil marshals as null, not [].
		out[slug] = append([]string{}, assigned[slug]...)
	}
	return out, nil
}
