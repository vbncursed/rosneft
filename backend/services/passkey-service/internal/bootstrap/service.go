package bootstrap

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/config"
	passkeysvc "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	credstore "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/storage/credentials"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/transport/grpcapi"
	pkwa "github.com/vbncursed/rosneft/backend/services/passkey-service/internal/webauthn"
)

// InitService wires storage + engine + ceremonies + auth client → service →
// gRPC handler. Returns the auth client too so RunServe can Close it.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *auth.Client, error) {
	engine, err := pkwa.NewEngine(cfg.RPID, cfg.RPName, cfg.RPOrigins)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: engine: %w", err)
	}
	authClient, err := auth.Dial(cfg.AuthGRPCAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: dial auth: %w", err)
	}
	store := credstore.New(pool)
	cer := ceremony.New(rdb, cfg.CeremonyTTL)
	svc := passkeysvc.New(store, cer, engine)
	return grpcapi.New(svc, authClient), authClient, nil
}
