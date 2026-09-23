package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// SetTerritoryAdmins replaces a territory's assigned-admin set.
func (c *Client) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	_, err := c.cc.SetTerritoryAdmins(ctx, &catalogv1.SetTerritoryAdminsRequest{Slug: slug, AdminUserIds: adminIDs})
	if err != nil {
		return fmt.Errorf("catalog.SetTerritoryAdmins: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return nil
}

// GetTerritoryAdmins returns the admin user ids assigned to a territory.
func (c *Client) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	resp, err := c.cc.GetTerritoryAdmins(ctx, &catalogv1.GetTerritoryAdminsRequest{Slug: slug})
	if err != nil {
		return nil, fmt.Errorf("catalog.GetTerritoryAdmins: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return resp.GetAdminUserIds(), nil
}

// ListTerritoryAdmins returns the admin ids of each of slugs, grouped by slug.
// A slug nobody is assigned to is absent.
func (c *Client) ListTerritoryAdmins(ctx context.Context, slugs []string) (map[string][]string, error) {
	resp, err := c.cc.ListTerritoryAdmins(ctx, &catalogv1.ListTerritoryAdminsRequest{Slugs: slugs})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTerritoryAdmins: %w", grpcerr.MapStatus(err, nil))
	}
	out := make(map[string][]string)
	for _, a := range resp.GetAdmins() {
		out[a.GetTerritorySlug()] = append(out[a.GetTerritorySlug()], a.GetAdminUserId())
	}
	return out, nil
}
