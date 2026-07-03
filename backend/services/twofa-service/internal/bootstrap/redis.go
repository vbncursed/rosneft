package bootstrap

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
)

// InitRedis opens and verifies a redis.Client. The caller must Close it.
func InitRedis(ctx context.Context, cfg config.Config) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, DB: cfg.RedisDB})
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("bootstrap: redis ping: %w", err)
	}
	return client, nil
}
