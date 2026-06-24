// Command mesh-api is the gRPC entrypoint for the mesh service. The actual
// wiring lives in internal/bootstrap; main only sets up Cobra and dispatches
// to bootstrap.RunAPI.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "mesh-api",
		Short:         "Andrey mesh API (gRPC)",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          run,
	}
	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9002", "gRPC listen address")
	flags.String("redis-addr", "redis:6379", "Redis address")
	flags.Int("redis-db", 0, "Redis logical database index")
	flags.String("log-level", "info", "log level")
	flags.String("log-format", "json", "log format: json|text")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")
	return cmd
}

func run(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load(cmd)
	if err != nil {
		return err
	}
	if err := cfg.ValidateAPI(); err != nil {
		return err
	}
	return bootstrap.RunAPI(cmd.Context(), cfg)
}
