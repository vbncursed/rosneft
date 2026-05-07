package bootstrap

import (
	"context"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/worker"
)

// Compile-time assertions: storage satisfies both the service-layer queue
// contract and the worker-layer queue contract.
var (
	_ service.Queue = (*storage.Redis)(nil)
	_ worker.Queue  = (*storage.Redis)(nil)
)

// InitStorage wraps a redis.Client in the queue + state adapter.
// It also creates the consumer group if missing.
func InitStorage(ctx context.Context, client *redis.Client) (*storage.Redis, error) {
	return storage.New(ctx, client)
}
