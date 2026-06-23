// Command auth is the gRPC service that owns users, roles, permissions,
// sessions, and 2FA. Wiring lives in internal/bootstrap.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "auth",
		Short:         "Rosneft auth service",
		Long:          "gRPC service that owns users, roles, permissions, sessions, and 2FA.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runServe,
	}
	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9004", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set AUTH_DB_DSN)")
	flags.String("redis-addr", "redis:6379", "Redis address")
	flags.Int("redis-db", 1, "Redis logical DB")
	flags.String("secret-key", "", "32-byte key (hex or base64) for TOTP secret encryption")
	flags.Duration("session-idle-ttl", 24*time.Hour, "session idle timeout")
	flags.Duration("session-absolute-ttl", 720*time.Hour, "session absolute max lifetime")
	flags.Duration("pending-2fa-ttl", 5*time.Minute, "2FA challenge lifetime")
	flags.Int("login-max-fails", 5, "failed logins before lockout")
	flags.Duration("login-lock-ttl", 15*time.Minute, "login lockout duration")
	flags.String("bootstrap-email", "", "first-admin email (created if no admin exists)")
	flags.String("bootstrap-username", "", "first-admin username")
	flags.String("bootstrap-password", "", "first-admin password")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Bool("auto-migrate", true, "run goose migrations on startup")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")

	cmd.AddCommand(
		&cobra.Command{Use: "serve", Short: "Start the gRPC server (default)", RunE: runServe},
		subCmd("migrate-up", "Apply pending migrations", bootstrap.RunMigrateUp),
		subCmd("migrate-down", "Roll back the most recent migration", bootstrap.RunMigrateDown),
		subCmd("migrate-status", "Print migration status", bootstrap.RunMigrateStatus),
	)
	return cmd
}

func subCmd(use, short string, fn func(context.Context, config.Config) error) *cobra.Command {
	return &cobra.Command{Use: use, Short: short, RunE: func(cmd *cobra.Command, _ []string) error {
		cfg, err := loadCfg(cmd)
		if err != nil {
			return err
		}
		return fn(cmd.Context(), cfg)
	}}
}

func runServe(cmd *cobra.Command, _ []string) error {
	cfg, err := loadCfg(cmd)
	if err != nil {
		return err
	}
	return bootstrap.RunServe(cmd.Context(), cfg)
}

func loadCfg(cmd *cobra.Command) (config.Config, error) {
	cfg, err := config.Load(cmd)
	if err != nil {
		return config.Config{}, err
	}
	if err := cfg.Validate(); err != nil {
		return config.Config{}, err
	}
	return cfg, nil
}
