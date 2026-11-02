package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListZones returns every zone on a territory in id order, [] when there are
// none and for an unknown territory too: the gateway's gate and the scene
// bundle's own territory read answer "not found".
func (r *PG) ListZones(ctx context.Context, territorySlug string) ([]domain.Zone, error) {
	zones, err := loadZones(ctx, r.pool, `WHERE t.slug = $1`, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListZones: %w", err)
	}
	return zones, nil
}
