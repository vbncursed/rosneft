package bootstrap

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/transport/grpcapi"
)

// InitService wires storage → service → gRPC handler and hands the store back
// so RunServe can run the trigger-attachment step against it.
func InitService(pool *pgxpool.Pool) (*grpcapi.Server, *storage.PG) {
	store := storage.New(pool)
	return grpcapi.New(service.New(store)), store
}
