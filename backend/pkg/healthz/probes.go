package healthz

import (
	"context"
	"fmt"
	"os"

	"google.golang.org/grpc"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// GRPCProbe reports whether the peer behind conn answers grpc_health_v1 with
// SERVING. Used by the gateway to fan its /readyz out across its backends.
func GRPCProbe(conn grpc.ClientConnInterface) Probe {
	return func(ctx context.Context) error {
		resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
		if err != nil {
			return err
		}
		if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
			return fmt.Errorf("healthz: peer reports %s", resp.GetStatus())
		}
		return nil
	}
}

// DirProbe reports whether path exists and is a directory. A blob store root
// replaced by a file is not a working store, so IsDir is checked rather than
// existence alone.
func DirProbe(path string) Probe {
	return func(context.Context) error {
		fi, err := os.Stat(path)
		if err != nil {
			return err
		}
		if !fi.IsDir() {
			return fmt.Errorf("healthz: %s is not a directory", path)
		}
		return nil
	}
}
