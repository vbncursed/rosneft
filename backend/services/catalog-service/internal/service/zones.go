package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func requireTerritory(op, territorySlug string) error {
	if territorySlug == "" {
		return fmt.Errorf("service.%s: %w: empty territory slug", op, domain.ErrInvalidInput)
	}
	return nil
}

// ListZones returns every zone on territorySlug.
func (c *Catalog) ListZones(ctx context.Context, territorySlug string) ([]domain.Zone, error) {
	if err := requireTerritory("ListZones", territorySlug); err != nil {
		return nil, err
	}
	return c.repo.ListZones(ctx, territorySlug)
}

// CreateZone adds a zone once its shape, title and tags check out. Whether the
// tags exist is storage's to say, in the write's own transaction.
func (c *Catalog) CreateZone(ctx context.Context, territorySlug string, z domain.ZoneCreate) (domain.Zone, error) {
	if err := requireTerritory("CreateZone", territorySlug); err != nil {
		return domain.Zone{}, err
	}
	z, err := z.Validate()
	if err != nil {
		return domain.Zone{}, fmt.Errorf("service.CreateZone: %w", err)
	}
	return c.repo.CreateZone(ctx, territorySlug, z)
}

// UpdateZone retitles a zone and/or replaces its tags. An empty patch is
// allowed and answers the stored zone.
func (c *Catalog) UpdateZone(
	ctx context.Context,
	territorySlug string,
	id int64,
	p domain.ZonePatch,
) (domain.Zone, error) {
	if err := requireTerritory("UpdateZone", territorySlug); err != nil {
		return domain.Zone{}, err
	}
	if p.Title != nil {
		title, err := domain.TrimZoneTitle(*p.Title)
		if err != nil {
			return domain.Zone{}, fmt.Errorf("service.UpdateZone: %w", err)
		}
		p.Title = &title
	}
	if p.SetTags {
		if err := domain.ValidateZoneTags(p.TagSlugs); err != nil {
			return domain.Zone{}, fmt.Errorf("service.UpdateZone: %w", err)
		}
	}
	return c.repo.UpdateZone(ctx, territorySlug, id, p)
}

// DeleteZone removes a zone; its tag links go with it.
func (c *Catalog) DeleteZone(ctx context.Context, territorySlug string, id int64) error {
	if err := requireTerritory("DeleteZone", territorySlug); err != nil {
		return err
	}
	return c.repo.DeleteZone(ctx, territorySlug, id)
}
