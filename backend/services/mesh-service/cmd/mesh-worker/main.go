// Command mesh-worker consumes conversion jobs from Redis Streams. The
// actual wiring + consume loop live in internal/bootstrap; main only sets
// up Cobra and dispatches to bootstrap.RunWorker.
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
		Use:           "mesh-worker",
		Short:         "Rosneft mesh worker (Redis Streams consumer)",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          run,
	}
	flags := cmd.PersistentFlags()
	flags.String("redis-addr", "redis:6379", "Redis address")
	flags.Int("redis-db", 0, "Redis logical database index")
	flags.String("catalog-grpc-addr", "catalog:9001", "Catalog gRPC address")
	flags.String("blob-dir", "", "BlobStore root directory (or set MESH_BLOB_DIR)")
	flags.String("source-dir", "", "Source mesh root directory (or set MESH_SOURCE_DIR)")
	flags.String("worker-name", "mesh-worker-1", "Consumer name within the group")
	flags.Duration("block-timeout", 5*time.Second, "XREADGROUP block duration per poll")
	flags.Int("max-concurrent-jobs", 0, "max parallel conversions (0 = GOMAXPROCS)")
	flags.String("log-level", "info", "log level")
	flags.String("log-format", "json", "log format: json|text")
	flags.Duration("shutdown-timeout", 30*time.Second, "graceful shutdown timeout")
	return cmd
}

func run(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load(cmd)
	if err != nil {
		return err
	}
	if err := cfg.ValidateWorker(); err != nil {
		return err
	}
	return bootstrap.RunWorker(cmd.Context(), cfg)
}
