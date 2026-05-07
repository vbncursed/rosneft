// Command catalog is the gRPC service that owns the project + artifact
// registry. The actual wiring lives in internal/bootstrap; main only sets
// up Cobra and dispatches to the relevant Run* function.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "catalog",
		Short:         "Rosneft catalog service",
		Long:          "gRPC service that owns the project + artifact registry.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runServe,
	}

	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9001", "gRPC listen address")
	flags.String("db-dsn", "", "PostgreSQL DSN (or set CATALOG_DB_DSN)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Bool("auto-migrate", true, "run goose migrations on startup (serve only)")
	flags.String("seed-file", "", "path to projects YAML to seed on startup (serve only)")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")

	cmd.AddCommand(
		newServeSubCmd(),
		newMigrateUpCmd(),
		newMigrateDownCmd(),
		newMigrateStatusCmd(),
		newSeedCmd(),
	)
	return cmd
}

func newServeSubCmd() *cobra.Command {
	return &cobra.Command{Use: "serve", Short: "Start the gRPC server (default)", RunE: runServe}
}

func runServe(cmd *cobra.Command, _ []string) error {
	cfg, err := loadCfg(cmd)
	if err != nil {
		return err
	}
	return bootstrap.RunServe(cmd.Context(), cfg)
}

func newMigrateUpCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "migrate-up",
		Short: "Apply pending database migrations",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadCfg(cmd)
			if err != nil {
				return err
			}
			return bootstrap.RunMigrateUp(cmd.Context(), cfg)
		},
	}
}

func newMigrateDownCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "migrate-down",
		Short: "Roll back the most recent migration",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadCfg(cmd)
			if err != nil {
				return err
			}
			return bootstrap.RunMigrateDown(cmd.Context(), cfg)
		},
	}
}

func newMigrateStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "migrate-status",
		Short: "Print current migration status",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadCfg(cmd)
			if err != nil {
				return err
			}
			return bootstrap.RunMigrateStatus(cmd.Context(), cfg)
		},
	}
}

func newSeedCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "seed [file]",
		Short: "Upsert projects from a YAML manifest",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := loadCfg(cmd)
			if err != nil {
				return err
			}
			n, err := bootstrap.RunSeed(cmd.Context(), cfg, args[0])
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "seeded %d projects from %s\n", n, args[0])
			return nil
		},
	}
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
