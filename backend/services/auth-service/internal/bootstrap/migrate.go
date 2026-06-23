package bootstrap

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
)

func RunMigrateUp(ctx context.Context, cfg config.Config) error { return migrate.Up(ctx, cfg.DBDSN) }
func RunMigrateDown(ctx context.Context, cfg config.Config) error {
	return migrate.Down(ctx, cfg.DBDSN)
}
func RunMigrateStatus(ctx context.Context, cfg config.Config) error {
	return migrate.Status(ctx, cfg.DBDSN)
}
