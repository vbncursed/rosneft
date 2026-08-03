// Command gateway is the public REST/OpenAPI 3.0 edge for the Andrey
// backend. The actual wiring lives in internal/bootstrap; main only sets
// up Cobra and dispatches.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

func main() {
	if err := newRootCmd().ExecuteContext(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "gateway",
		Short:         "Andrey public API gateway",
		Long:          "REST/OpenAPI 3.0 surface in front of catalog (gRPC), mesh (gRPC), and asset (HTTP) services.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          run,
	}
	flags := cmd.PersistentFlags()
	flags.String("http-addr", ":8080", "HTTP listen address")
	flags.String("catalog-grpc-addr", "catalog:9001", "Catalog gRPC address")
	flags.String("content-grpc-addr", "content:9007", "Content gRPC address")
	flags.String("audit-grpc-addr", "audit:9009", "Audit gRPC address")
	flags.String("mesh-grpc-addr", "mesh-api:9002", "Mesh gRPC address")
	flags.String("upload-grpc-addr", "upload:9003", "Upload gRPC address")
	flags.String("auth-grpc-addr", "auth:9004", "Auth gRPC address")
	flags.String("asset-http-addr", "http://asset:8081", "Asset HTTP address")
	flags.StringSlice("allowed-origins", nil, "CORS allowed origins; empty disables CORS entirely (a same-origin SPA needs none)")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Duration("read-timeout", 10*time.Second, "HTTP read timeout")
	flags.Duration("write-timeout", 5*time.Minute, "HTTP write timeout")
	flags.Duration("idle-timeout", 2*time.Minute, "HTTP idle timeout")
	flags.Duration("shutdown-timeout", 15*time.Second, "graceful shutdown timeout")
	flags.Bool("cookie-secure", true, "mark the session cookie Secure; disable only for plain-http local dev")
	flags.Duration("session-cookie-ttl", 720*time.Hour, "session cookie Max-Age; should not exceed auth's absolute session TTL")
	flags.String("csrf-secret", "", "HMAC key for the anti-CSRF token (required)")

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
