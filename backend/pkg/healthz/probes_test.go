package healthz_test

import (
	"context"
	"net"
	"os"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/test/bufconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
)

type ProbesSuite struct{ suite.Suite }

func TestProbesSuite(t *testing.T) { suite.Run(t, new(ProbesSuite)) }

func (s *ProbesSuite) TestGRPCProbeReflectsPeerStatus() {
	tests := []struct {
		name    string
		status  healthpb.HealthCheckResponse_ServingStatus
		wantErr string
	}{
		{name: "serving peer passes", status: healthpb.HealthCheckResponse_SERVING},
		{name: "not-serving peer fails", status: healthpb.HealthCheckResponse_NOT_SERVING, wantErr: "NOT_SERVING"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			conn := s.dialHealthPeer(tt.status)
			err := healthz.GRPCProbe(conn)(s.T().Context())
			if tt.wantErr == "" {
				assert.NilError(s.T(), err)
				return
			}
			assert.ErrorContains(s.T(), err, tt.wantErr)
		})
	}
}

// dialHealthPeer starts an in-memory gRPC server reporting status for the
// overall (empty-name) service and returns a client conn to it, wired up for
// automatic teardown at test cleanup.
func (s *ProbesSuite) dialHealthPeer(status healthpb.HealthCheckResponse_ServingStatus) *grpc.ClientConn {
	lis := bufconn.Listen(1024 * 1024)
	srv := grpc.NewServer()
	hs := health.NewServer()
	hs.SetServingStatus("", status)
	healthpb.RegisterHealthServer(srv, hs)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = conn.Close() })
	return conn
}

func (s *ProbesSuite) TestDirProbePassesOnExistingDir() {
	err := healthz.DirProbe(s.T().TempDir())(s.T().Context())
	assert.NilError(s.T(), err)
}

func (s *ProbesSuite) TestDirProbeFailsOnMissingDir() {
	err := healthz.DirProbe(s.T().TempDir() + "/nope")(s.T().Context())
	assert.ErrorContains(s.T(), err, "nope")
}

func (s *ProbesSuite) TestDirProbeFailsOnAFile() {
	// A blob store root that has been replaced by a file is not a working
	// store, and Stat alone would call that healthy.
	f := s.T().TempDir() + "/file"
	assert.NilError(s.T(), os.WriteFile(f, []byte("x"), 0o600))
	err := healthz.DirProbe(f)(s.T().Context())
	assert.ErrorContains(s.T(), err, "not a directory")
}
