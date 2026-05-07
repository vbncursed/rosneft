package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// InitService wires the storage adapter into the business layer.
// The compile-time assertion guarantees PG satisfies service.Repository.
var _ service.Repository = (*storage.PG)(nil)

func InitService(repo *storage.PG) *service.Catalog {
	return service.New(repo)
}
