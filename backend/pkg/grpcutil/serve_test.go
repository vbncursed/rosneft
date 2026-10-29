package grpcutil_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

const testHealthName = "test.v1.Svc"

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuf) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

type serveFixture struct {
	cfg  grpcutil.ServeConfig
	logs *syncBuf
}

// freeAddr returns an address nothing listens on right now.
func freeAddr(t *testing.T) string {
	t.Helper()
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	addr := lis.Addr().String()
	assert.NilError(t, lis.Close())
	return addr
}

func newServeFixture(t *testing.T, timeout time.Duration) *serveFixture {
	t.Helper()
	logs := &syncBuf{}
	srv := grpc.NewServer()
	hs := health.NewServer()
	healthpb.RegisterHealthServer(srv, hs)
	hs.SetServingStatus(testHealthName, healthpb.HealthCheckResponse_SERVING)
	return &serveFixture{
		logs: logs,
		cfg: grpcutil.ServeConfig{
			Service:         "test",
			Addr:            freeAddr(t),
			MetricsAddr:     "127.0.0.1:0",
			ShutdownTimeout: timeout,
			Server:          srv,
			Health:          hs,
			HealthName:      testHealthName,
			Logger:          slog.New(slog.NewTextHandler(logs, nil)),
		},
	}
}

func (f *serveFixture) run(ctx context.Context) <-chan error {
	done := make(chan error, 1)
	go func() { done <- grpcutil.Serve(ctx, f.cfg) }()
	return done
}

func (f *serveFixture) dial(t *testing.T) healthpb.HealthClient {
	t.Helper()
	conn, err := grpc.NewClient(f.cfg.Addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	assert.NilError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	return healthpb.NewHealthClient(conn)
}

func (f *serveFixture) status(t *testing.T) healthpb.HealthCheckResponse_ServingStatus {
	t.Helper()
	resp, err := f.cfg.Health.Check(t.Context(), &healthpb.HealthCheckRequest{Service: testHealthName})
	assert.NilError(t, err)
	return resp.GetStatus()
}

func waitServing(t *testing.T, c healthpb.HealthClient) {
	t.Helper()
	assert.Assert(t, func() bool {
		for range 100 {
			ctx, cancel := context.WithTimeout(t.Context(), time.Second)
			resp, err := c.Check(ctx, &healthpb.HealthCheckRequest{Service: testHealthName})
			cancel()
			if err == nil && resp.GetStatus() == healthpb.HealthCheckResponse_SERVING {
				return true
			}
			time.Sleep(20 * time.Millisecond)
		}
		return false
	}(), "server never became reachable")
}

func recv[T any](t *testing.T, ch <-chan T, within time.Duration) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(within):
		t.Fatal("timed out waiting for Serve to return")
		panic("unreachable")
	}
}

func TestServe_ServesAndShutsDownGracefullyOnCancel(t *testing.T) {
	f := newServeFixture(t, 5*time.Second)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := f.run(ctx)
	waitServing(t, f.dial(t))
	assert.Equal(t, f.status(t), healthpb.HealthCheckResponse_SERVING)

	cancel()

	assert.NilError(t, recv(t, done, 3*time.Second))
	assert.Equal(t, f.status(t), healthpb.HealthCheckResponse_NOT_SERVING)
	logs := f.logs.String()
	assert.Assert(t, strings.Contains(logs, "test: serving gRPC"), logs)
	assert.Assert(t, strings.Contains(logs, "test: shutdown signal received"), logs)
	assert.Assert(t, strings.Contains(logs, "test: graceful shutdown complete"), logs)
	assert.Assert(t, !strings.Contains(logs, "forcing stop"), logs)
}

// The Docker/compose healthcheck probes the unnamed service ("") and
// grpc.health.v1 reports it as the overall status, so shutdown flips it too.
func TestServe_ShutdownFlipsTheOverallHealthToo(t *testing.T) {
	f := newServeFixture(t, 5*time.Second)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := f.run(ctx)
	waitServing(t, f.dial(t))
	resp, err := f.cfg.Health.Check(t.Context(), &healthpb.HealthCheckRequest{})
	assert.NilError(t, err)
	assert.Equal(t, resp.GetStatus(), healthpb.HealthCheckResponse_SERVING)

	cancel()

	assert.NilError(t, recv(t, done, 3*time.Second))
	resp, err = f.cfg.Health.Check(t.Context(), &healthpb.HealthCheckRequest{})
	assert.NilError(t, err)
	assert.Equal(t, resp.GetStatus(), healthpb.HealthCheckResponse_NOT_SERVING)
}

func TestServe_ForcesStopWhenAnRPCOutlivesShutdownTimeout(t *testing.T) {
	f := newServeFixture(t, 200*time.Millisecond)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := f.run(ctx)
	client := f.dial(t)
	waitServing(t, client)

	// Health.Watch is a stream that stays open until the client goes away,
	// so GracefulStop cannot finish on its own.
	stream, err := client.Watch(t.Context(), &healthpb.HealthCheckRequest{Service: testHealthName})
	assert.NilError(t, err)
	_, err = stream.Recv()
	assert.NilError(t, err)

	cancel()

	assert.NilError(t, recv(t, done, 3*time.Second))
	// The forced Stop is what ends the still-open stream.
	recvErr := make(chan error, 1)
	go func() {
		for { // the NOT_SERVING update arrives first, then the stream breaks
			if _, err := stream.Recv(); err != nil {
				recvErr <- err
				return
			}
		}
	}()
	assert.Assert(t, recv(t, recvErr, 3*time.Second) != nil)
	logs := f.logs.String()
	assert.Assert(t, strings.Contains(logs, "test: shutdown timeout, forcing stop"), logs)
	assert.Assert(t, !strings.Contains(logs, "graceful shutdown complete"), logs)
}

func TestServe_BadAddrReturnsWrappedListenError(t *testing.T) {
	f := newServeFixture(t, time.Second)
	f.cfg.Addr = "256.0.0.1:99999"

	err := grpcutil.Serve(t.Context(), f.cfg)

	assert.ErrorContains(t, err, "listen 256.0.0.1:99999: ")
	var opErr *net.OpError
	assert.Assert(t, errors.As(err, &opErr), "listen error must stay in the chain")
}

type brokenListener struct {
	net.Listener
	err error
}

func (b brokenListener) Accept() (net.Conn, error) { return nil, b.err }

func TestServe_ServerFailureBeforeCancelIsReturnedWrapped(t *testing.T) {
	f := newServeFixture(t, time.Second)
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	boom := errors.New("accept boom")

	err = grpcutil.ServeOn(t.Context(), brokenListener{Listener: lis, err: boom}, f.cfg)

	assert.ErrorIs(t, err, boom)
	assert.ErrorContains(t, err, "grpc serve: ")
	// A failed serve returns before the shutdown sequence.
	assert.Equal(t, f.status(t), healthpb.HealthCheckResponse_SERVING)
}

func TestServe_StoppedServerIsNotAnError(t *testing.T) {
	f := newServeFixture(t, time.Second)
	f.cfg.Server.Stop()

	assert.NilError(t, recv(t, f.run(t.Context()), 3*time.Second))
	assert.Equal(t, f.status(t), healthpb.HealthCheckResponse_NOT_SERVING)
}

func TestServe_MetricsListenerFailureIsOnlyLogged(t *testing.T) {
	f := newServeFixture(t, 5*time.Second)
	taken, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = taken.Close() })
	f.cfg.MetricsAddr = taken.Addr().String()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := f.run(ctx)
	waitServing(t, f.dial(t))
	assert.Assert(t, func() bool {
		for range 100 {
			if strings.Contains(f.logs.String(), "metrics: listener failed") {
				return true
			}
			time.Sleep(20 * time.Millisecond)
		}
		return false
	}(), f.logs.String())

	cancel()
	assert.NilError(t, recv(t, done, 3*time.Second))
}
