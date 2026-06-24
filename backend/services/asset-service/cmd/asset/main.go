// Command asset serves binary artifacts (GLB, JPG previews) over HTTP with
// Range, ETag, and immutable caching. The actual wiring lives in
// internal/bootstrap; main only sets up Cobra and dispatches.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "asset",
		Short:         "Andrey asset HTTP server",
		Long:          "HTTP server that streams binary artifacts from BlobStore with Range, ETag, and immutable caching.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          run,
	}

	flags := cmd.PersistentFlags()
	flags.String("http-addr", ":8081", "HTTP listen address")
	flags.String("blob-dir", "", "BlobStore root directory (or set ASSET_BLOB_DIR)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Duration("read-timeout", 5*time.Second, "HTTP read timeout")
	flags.Duration("write-timeout", 5*time.Minute, "HTTP write timeout")
	flags.Duration("idle-timeout", 2*time.Minute, "HTTP idle timeout")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")

	return cmd
}

func run(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load(cmd)
	if err != nil {
		return err
	}
	if err := cfg.Validate(); err != nil {
		return err
	}
	return bootstrap.RunServe(cmd.Context(), cfg)
}
