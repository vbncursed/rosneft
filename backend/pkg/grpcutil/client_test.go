package grpcutil_test

import (
	"context"
	"net"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

type DialSuite struct{ suite.Suite }

func TestDialSuite(t *testing.T) { suite.Run(t, new(DialSuite)) }

// serveCountingHealth starts a bufconn gRPC server whose interceptor fails the
// first failures attempts with the given code and succeeds afterwards.
func (s *DialSuite) serveCountingHealth(failures int32, code codes.Code) (*grpc.ClientConn, *atomic.Int32) {
	var attempts atomic.Int32
	lis := bufconn.Listen(1024 * 1024)
	srv := grpc.NewServer(grpc.UnaryInterceptor(
		func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
			if attempts.Add(1) <= failures {
				return nil, status.Error(code, "not yet")
			}
			return h(ctx, req)
		},
	))
	healthpb.RegisterHealthServer(srv, health.NewServer())
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	conn, err := grpcutil.Dial("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = conn.Close() })
	return conn, &attempts
}

func (s *DialSuite) TestRetriesUnavailable() {
	conn, attempts := s.serveCountingHealth(2, codes.Unavailable)

	_, err := healthpb.NewHealthClient(conn).Check(s.T().Context(), &healthpb.HealthCheckRequest{})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), int32(3), attempts.Load())
}

func (s *DialSuite) TestDoesNotRetryDeadlineExceeded() {
	// DEADLINE_EXCEEDED may mean the handler is still running, so a retry
	// would be a second execution. It must stay out of the retryable set.
	conn, attempts := s.serveCountingHealth(1, codes.DeadlineExceeded)

	_, err := healthpb.NewHealthClient(conn).Check(s.T().Context(), &healthpb.HealthCheckRequest{})
	assert.Assert(s.T(), err != nil)
	assert.Equal(s.T(), int32(1), attempts.Load())
}

func (s *DialSuite) TestStopsAtMaxAttempts() {
	conn, attempts := s.serveCountingHealth(10, codes.Unavailable)

	_, err := healthpb.NewHealthClient(conn).Check(s.T().Context(), &healthpb.HealthCheckRequest{})
	assert.Assert(s.T(), err != nil)
	assert.Equal(s.T(), int32(3), attempts.Load())
}

// A client stream (upload-service WriteChunk) must carry the actor too: the
// unary interceptor never sees a stream, and upload-service refuses a chunk
// whose session author it cannot compare against.
func (s *DialSuite) TestStreamCarriesActor() {
	seen := make(chan string, 1)
	lis := bufconn.Listen(1024 * 1024)
	srv := grpc.NewServer(grpc.UnknownServiceHandler(func(_ any, stream grpc.ServerStream) error {
		md, _ := metadata.FromIncomingContext(stream.Context())
		seen <- strings.Join(md.Get(grpcutil.ActorIDHeader), ",")
		return nil
	}))
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)
	conn, err := grpcutil.Dial("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = conn.Close() })

	ctx := grpcutil.WithActor(s.T().Context(), grpcutil.Actor{ID: "user-1"})
	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{ClientStreams: true}, "/test.Svc/Upload")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), stream.CloseSend())
	_ = stream.RecvMsg(new(healthpb.HealthCheckResponse))

	assert.Equal(s.T(), <-seen, "user-1")
}
