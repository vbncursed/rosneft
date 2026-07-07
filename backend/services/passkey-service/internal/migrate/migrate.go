// Package migrate runs goose migrations against PostgreSQL using SQL files
// embedded into the binary at compile time.
package migrate

import (
	"database/sql"
	"embed"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib" // registers "pgx" driver for database/sql
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func openDB(dsn string) (*sql.DB, error) {
	if dsn == "" {
		return nil, fmt.Errorf("migrate: empty DSN")
	}
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, fmt.Errorf("migrate: set dialect: %w", err)
	}
	// passkey shares the `andrey` database with catalog + auth + twofa; a custom
	// version table keeps the services' migration histories from colliding.
	goose.SetTableName("passkey_goose_db_version")
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("migrate: open db: %w", err)
	}
	return db, nil
}
