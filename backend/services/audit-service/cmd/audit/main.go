// Command audit is the gRPC service that owns the append-only change journal.
// Wiring lives in internal/bootstrap.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "audit",
		Short:         "Andrey audit service",
		Long:          "gRPC service that owns the append-only audit journal and its capture triggers.",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9009", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set AUDIT_DB_DSN)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Bool("auto-migrate", true, "run goose migrations on startup")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")

	cmd.AddCommand(
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
