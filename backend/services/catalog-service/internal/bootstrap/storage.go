package bootstrap

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// InitStorage wraps a pgxpool.Pool in the storage adapter.
func InitStorage(pool *pgxpool.Pool) *storage.PG {
	return storage.New(pool)
}
