// Command passkey is the gRPC service that owns WebAuthn credentials and
// ceremonies. Wiring lives in internal/bootstrap.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "passkey",
		Short:         "Andrey passkey service",
		Long:          "gRPC service that owns WebAuthn credentials and ceremonies.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runServe,
	}
	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9008", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set PASSKEY_DB_DSN)")
	flags.String("redis-addr", "redis:6379", "Redis address")
	flags.Int("redis-db", 3, "Redis logical DB")
	flags.String("rp-id", "", "WebAuthn Relying Party ID (registrable domain)")
	flags.StringSlice("rp-origins", nil, "allowed WebAuthn origins (scheme+host)")
	flags.String("rp-name", "Andrey", "WebAuthn Relying Party display name")
	flags.Duration("ceremony-ttl", 5*time.Minute, "in-flight ceremony state TTL")
	flags.String("auth-grpc-addr", "auth:9004", "auth-service gRPC address (identity resolution)")
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
