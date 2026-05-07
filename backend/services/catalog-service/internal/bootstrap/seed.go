package bootstrap

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/seed"
)

// RunSeed loads cfg, opens a pool, and upserts every project in path.
// Returns the count of upserted projects.
func RunSeed(ctx context.Context, cfg config.Config, path string) (int, error) {
	pool, err := InitPostgres(ctx, cfg)
	if err != nil {
		return 0, err
	}
	defer pool.Close()

	svc := InitService(InitStorage(pool))
	n, err := seed.FromFile(ctx, svc, path)
	if err != nil {
		return n, fmt.Errorf("bootstrap: seed: %w", err)
	}
	return n, nil
}
