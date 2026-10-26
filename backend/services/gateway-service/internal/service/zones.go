package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// The catalog scopes every zone id by territory slug, so an id of another
// territory is not found. It also owns the zone rules (corners, 1-5 tags, no
// ungrouped, title); the gateway checks only what it needs to address the call.

// ListZones returns the zones on a territory.
func (g *Gateway) ListZones(ctx context.Context, territorySlug string) ([]domain.Zone, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListZones(ctx, territorySlug)
}

// CreateZone draws a zone on a territory.
func (g *Gateway) CreateZone(ctx context.Context, territorySlug string, z domain.ZoneCreate) (domain.Zone, error) {
	if territorySlug == "" {
		return domain.Zone{}, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.CreateZone(ctx, territorySlug, z)
}

// UpdateZone renames a zone or replaces its tags.
func (g *Gateway) UpdateZone(ctx context.Context, territorySlug string, id int64, p domain.ZonePatch) (domain.Zone, error) {
	if err := checkAddress(territorySlug, id); err != nil {
		return domain.Zone{}, err
	}
	return g.catalog.UpdateZone(ctx, territorySlug, id, p)
}

// DeleteZone removes a zone.
func (g *Gateway) DeleteZone(ctx context.Context, territorySlug string, id int64) error {
	if err := checkAddress(territorySlug, id); err != nil {
		return err
	}
	return g.catalog.DeleteZone(ctx, territorySlug, id)
}

func checkAddress(territorySlug string, id int64) error {
	if territorySlug == "" {
		return fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return nil
}
