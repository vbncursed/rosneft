package grpcutil

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// healthcheckTimeout bounds the whole probe, dial included.
const healthcheckTimeout = 3 * time.Second

// CheckHealth dials target and reports whether it answers grpc_health_v1 with
// SERVING for the unnamed service.
//
// The connection is built with a bare grpc.NewClient rather than Dial: the
// retry policy would turn one failing probe into three, and a health check
// that retries is a health check that lies about how quickly it noticed.
func CheckHealth(ctx context.Context, target string) error {
	conn, err := newBareClient(target)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()

	resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil {
		return fmt.Errorf("grpcutil.CheckHealth %q: %w", target, err)
	}
	if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		return fmt.Errorf("grpcutil.CheckHealth %q: %s", target, resp.GetStatus())
	}
	return nil
}

// newBareClient opens a plain, non-retrying gRPC connection. Deliberately not
// Dial: a health probe must fail as fast as the first attempt, not after
// Dial's three-attempt UNAVAILABLE retry policy.
func newBareClient(target string) (*grpc.ClientConn, error) {
	conn, err := grpc.NewClient(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("grpcutil.CheckHealth: dial %q: %w", target, err)
	}
	return conn, nil
}

// HealthcheckCmd builds the `healthcheck` subcommand. addr resolves the
// service's own listen address from the command's flags and config, so each
// service keeps ownership of its own configuration loading.
func HealthcheckCmd(addr func(*cobra.Command) (string, error)) *cobra.Command {
	return &cobra.Command{
		Use:   "healthcheck",
		Short: "Probe this service's own health endpoint and exit 0 or 1",
		Long: "Used as the container healthcheck. The images are distroless — " +
			"no shell, no curl, no wget — so the service binary is the only " +
			"thing that can run inside them.",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			target, err := addr(cmd)
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(cmd.Context(), healthcheckTimeout)
			defer cancel()
			return CheckHealth(ctx, target)
		},
	}
}
