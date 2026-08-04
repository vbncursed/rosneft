// Command asset serves binary artifacts (GLB, JPG previews) over HTTP with
// Range, ETag, and immutable caching. The actual wiring lives in
// internal/bootstrap; main only sets up Cobra and dispatches.
package main

import (
	"context"
	"fmt"
	"net/http"
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

	cmd.AddCommand(newHealthcheckCmd())
	return cmd
}

func run(cmd *cobra.Command, _ []string) error {
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

// newHealthcheckCmd builds the `healthcheck` subcommand used as the
// container healthcheck. gateway and asset are HTTP, not gRPC, so they get a
// small local probe against their own /readyz rather than
// grpcutil.HealthcheckCmd.
func newHealthcheckCmd() *cobra.Command {
	return &cobra.Command{
		Use:          "healthcheck",
		Short:        "Probe this service's own /readyz and exit 0 or 1",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadCfg(cmd)
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(cmd.Context(), 3*time.Second)
			defer cancel()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost"+cfg.HTTPAddr+"/readyz", nil)
			if err != nil {
				return err
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return err
			}
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				return fmt.Errorf("readyz: %s", resp.Status)
			}
			return nil
		},
	}
}
