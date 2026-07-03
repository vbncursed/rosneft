package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// Status prints the migration status.
func Status(ctx context.Context, dsn string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	return goose.StatusContext(ctx, db, "migrations")
}
