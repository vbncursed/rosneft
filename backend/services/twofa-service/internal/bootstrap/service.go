package bootstrap

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/ratelimit"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/secret"
	twofasvc "github.com/vbncursed/rosneft/backend/services/twofa-service/internal/service/twofa"
	credstore "github.com/vbncursed/rosneft/backend/services/twofa-service/internal/storage/credentials"
	recstore "github.com/vbncursed/rosneft/backend/services/twofa-service/internal/storage/recovery"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/transport/grpcapi"
)

// InitService wires storage + auth client → service → gRPC handler. Returns the
// auth client too so RunServe can Close it.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *auth.Client, error) {
	cipher, err := secret.NewCipher(cfg.SecretKey)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: cipher: %w", err)
	}
	authClient, err := auth.Dial(cfg.AuthGRPCAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: dial auth: %w", err)
	}
	creds := credstore.New(pool)
	rec := recstore.New(pool)
	limiter := ratelimit.New(rdb, cfg.VerifyMaxFails, cfg.VerifyLockTTL)
	svc := twofasvc.New(creds, rec, cipher, limiter, cfg.Issuer)
	return grpcapi.New(svc, authClient), authClient, nil
}
