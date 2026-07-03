// Command gateway is the public REST/OpenAPI 3.0 edge for the Andrey
// backend. The actual wiring lives in internal/bootstrap; main only sets
// up Cobra and dispatches.
package main

import (
	"context"
	"fmt"
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
	flags.String("mesh-grpc-addr", "mesh-api:9002", "Mesh gRPC address")
	flags.String("upload-grpc-addr", "upload:9003", "Upload gRPC address")
	flags.String("auth-grpc-addr", "auth:9004", "Auth gRPC address")
	flags.String("asset-http-addr", "http://asset:8081", "Asset HTTP address")
	flags.StringSlice("allowed-origins", []string{"*"}, "CORS allowed origins")
	flags.String("log-level", "info", "log level: debug|info|warn|error")
	flags.String("log-format", "json", "log format: json|text")
	flags.Duration("read-timeout", 10*time.Second, "HTTP read timeout")
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
