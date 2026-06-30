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
