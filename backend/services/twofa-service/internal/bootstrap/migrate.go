package bootstrap

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/migrate"
)

// RunMigrateUp applies all pending migrations.
func RunMigrateUp(ctx context.Context, cfg config.Config) error { return migrate.Up(ctx, cfg.DBDSN) }

// RunMigrateDown rolls back the most recent migration.
func RunMigrateDown(ctx context.Context, cfg config.Config) error {
	return migrate.Down(ctx, cfg.DBDSN)
}

// RunMigrateStatus prints the migration status.
func RunMigrateStatus(ctx context.Context, cfg config.Config) error {
	return migrate.Status(ctx, cfg.DBDSN)
}
