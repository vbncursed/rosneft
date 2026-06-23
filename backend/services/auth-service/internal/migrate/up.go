package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// Up applies all pending migrations.
func Up(ctx context.Context, dsn string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	return goose.UpContext(ctx, db, "migrations")
}
