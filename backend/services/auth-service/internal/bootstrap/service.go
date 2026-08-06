package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	passkeyclient "github.com/vbncursed/rosneft/backend/services/auth-service/internal/clients/passkey"
	twofaclient "github.com/vbncursed/rosneft/backend/services/auth-service/internal/clients/twofa"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	authsvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	rolesvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	usersvc "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
	permstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/permissions"
	rolestore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/roles"
	userstore "github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// InitService wires storage → session → services → gRPC handler. Returns the
// user store (for the bootstrap-admin step) and the twofa client (to Close).
func InitService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.Config) (*grpcapi.Server, *userstore.Store, *twofaclient.Client, *passkeyclient.Client, error) {
	twofaC, err := twofaclient.Dial(cfg.TwoFAGRPCAddr)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("bootstrap.InitService: dial twofa: %w", err)
	}
	passkeyC, err := passkeyclient.Dial(cfg.PasskeyGRPCAddr)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("bootstrap.InitService: dial passkey: %w", err)
	}
	us := userstore.New(pool)
	rs := rolestore.New(pool)
	ps := permstore.New(pool)
	sess := session.New(rdb, cfg.SessionIdleTTL, cfg.SessionAbsoluteTTL, cfg.Pending2FATTL, cfg.LoginMaxFails, cfg.LoginLockTTL)

	authS := authsvc.New(us, sess, twofaC, passkeyC, cfg.SessionAbsoluteTTL)
	userS := usersvc.New(us, sess)
	roleS := rolesvc.New(rs, ps, us)

	return grpcapi.New(authS, userS, roleS), us, twofaC, passkeyC, nil
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
	// This is the second path that writes a username, and it does not go through
	// the users service — so the one-word rule has to be applied here too, or a
	// fresh install can seed an admin the API would refuse to create. Checked
	// after the "admin exists" return on purpose: a stale env var on a running
	// system is unused, and must not block startup.
	username := strings.TrimSpace(cfg.BootstrapUsername)
	if err := validate.Username(username); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	hash, err := password.Hash(cfg.BootstrapPassword)
	if err != nil {
		return fmt.Errorf("bootstrap admin: hash: %w", err)
	}
	_, err = store.Create(ctx, domain.User{
		Email: domain.Fold(cfg.BootstrapEmail), Username: username,
		PasswordHash: hash, RoleSlugs: []string{"admin"}, IsOwner: true,
	})
	if err != nil && !errors.Is(err, domain.ErrEmailTaken) && !errors.Is(err, domain.ErrUsernameTaken) {
		return fmt.Errorf("bootstrap admin: create: %w", err)
	}
	return nil
}
