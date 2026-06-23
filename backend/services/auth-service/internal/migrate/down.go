package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// Down rolls back the most recent migration.
func Down(ctx context.Context, dsn string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	return goose.DownContext(ctx, db, "migrations")
}
