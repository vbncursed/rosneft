// Command upload is the gRPC service that owns resumable chunked uploads.
// The actual wiring lives in internal/bootstrap; main only sets up Cobra and
// dispatches.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "upload",
		Short:         "Andrey chunked upload service",
		Long:          "gRPC service for resumable uploads. Bytes land in BlobStore as content-addressed blobs.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          run,
	}

	flags := cmd.PersistentFlags()
	flags.String("grpc-addr", ":9003", "gRPC listen address")
	flags.String("blob-dir", "/var/blob", "BlobStore root directory")
	flags.String("incoming-dir", "/var/upload/incoming", "in-progress upload session directory")
	flags.Int64("max-upload-bytes", 2<<30, "maximum upload size in bytes (default 2 GiB)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
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
