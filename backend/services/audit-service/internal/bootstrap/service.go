package bootstrap

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/transport/grpcapi"
)

// InitService wires storage → service → gRPC handler. It hands back the store
// so RunServe can run the trigger-attachment step against it, and the service
// so the checkpointer can tick against the same instance.
func InitService(pool *pgxpool.Pool) (*grpcapi.Server, *storage.PG, *service.Service) {
	store := storage.New(pool)
	svc := service.New(store)
	return grpcapi.New(svc), store, svc
}
