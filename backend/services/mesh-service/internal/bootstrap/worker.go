package bootstrap

import (
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/worker"
)

// Compile-time assertion: service.Mesh satisfies the worker's mesh contract.
var _ worker.Mesh = (*service.Mesh)(nil)

// InitWorker wires the consumer with its dependencies.
func InitWorker(queue *storage.Redis, svc *service.Mesh, logger *slog.Logger, cfg config.Config) *worker.Worker {
	return worker.New(worker.Config{
		Queue:         queue,
		Mesh:          svc,
		Logger:        logger,
		Name:          cfg.WorkerName,
		BlockTimeout:  cfg.BlockTimeout,
		MaxConcurrent: cfg.MaxConcurrentJobs,
	})
}
