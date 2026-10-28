package bootstrap

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/config"
	passkeysvc "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	credstore "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/storage/credentials"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/transport/grpcapi"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// InitService wires storage + engine + ceremonies → service → gRPC handler.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, error) {
	engine, err := pkwa.NewEngine(cfg.RPID, cfg.RPName, cfg.RPOrigins)
	if err != nil {
		return nil, fmt.Errorf("bootstrap.InitService: engine: %w", err)
	}
	store := credstore.New(pool)
	cer := ceremony.New(rdb, cfg.CeremonyTTL)
	svc := passkeysvc.New(store, cer, engine)
	return grpcapi.New(svc), nil
}
