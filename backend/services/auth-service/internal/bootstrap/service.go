package bootstrap

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
	authsvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	rolesvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	twofasvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa"
	usersvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
	permstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/permissions"
	recstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/recovery"
	rolestore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/roles"
	userstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/transport/grpcapi"
)

// InitService wires storage → session → services → gRPC handler. Returns the
// user store too so RunServe can run the bootstrap-admin step.
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *userstore.Store, error) {
	cipher, err := secret.NewCipher(cfg.SecretKey)
	if err != nil {
		return nil, nil, fmt.Errorf("bootstrap.InitService: cipher: %w", err)
	}
	us := userstore.New(pool)
	rs := rolestore.New(pool)
	ps := permstore.New(pool)
	rc := recstore.New(pool)
	sess := session.New(rdb, cfg.SessionIdleTTL, cfg.SessionAbsoluteTTL, cfg.Pending2FATTL, cfg.LoginMaxFails, cfg.LoginLockTTL)

	authS := authsvc.New(us, sess, rc, cipher, cfg.SessionAbsoluteTTL)
	userS := usersvc.New(us, sess)
	twoS := twofasvc.New(us, rc, cipher, "Andrey")
	roleS := rolesvc.New(rs, ps)

	return grpcapi.New(authS, userS, twoS, roleS), us, nil
}

// EnsureBootstrapAdmin creates the first admin from config if no admin exists.
// Idempotent: a no-op once any admin is present, or when bootstrap creds are
// unset.
func EnsureBootstrapAdmin(ctx context.Context, store *userstore.Store, cfg config.Config) error {
	if cfg.BootstrapEmail == "" || cfg.BootstrapPassword == "" || cfg.BootstrapUsername == "" {
		return nil
	}
	n, err := store.CountAdmins(ctx, "")
	if err != nil {
		return fmt.Errorf("bootstrap admin: count: %w", err)
	}
	if n > 0 {
		return nil
	}
	hash, err := password.Hash(cfg.BootstrapPassword)
	if err != nil {
		return fmt.Errorf("bootstrap admin: hash: %w", err)
	}
	_, err = store.Create(ctx, domain.User{
		Email: cfg.BootstrapEmail, Username: cfg.BootstrapUsername,
		PasswordHash: hash, RoleSlugs: []string{"admin"}, IsOwner: true,
	})
	if err != nil && !errors.Is(err, domain.ErrEmailTaken) && !errors.Is(err, domain.ErrUsernameTaken) {
		return fmt.Errorf("bootstrap admin: create: %w", err)
	}
	return nil
}
