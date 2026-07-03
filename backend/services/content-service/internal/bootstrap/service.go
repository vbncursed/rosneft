package bootstrap

import (
	"github.com/jackc/pgx/v5/pgxpool"

	svc "github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

// InitService wires storage → service → gRPC handler.
func InitService(pool *pgxpool.Pool) *grpcapi.Server {
	repo := storage.New(pool)
	return grpcapi.New(svc.New(repo))
}
