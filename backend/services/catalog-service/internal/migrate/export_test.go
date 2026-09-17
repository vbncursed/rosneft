package migrate

import (
	"context"

	"github.com/pressly/goose/v3"
)

// DownTo rolls back to version, so a suite can re-run one specific migration
// even after later ones have landed — Down only ever undoes the newest.
func DownTo(ctx context.Context, dsn string, version int64) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	return goose.DownToContext(ctx, db, "migrations", version)
}
