package grpcutil_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

type ReadinessSuite struct{ suite.Suite }

func TestReadinessSuite(t *testing.T) { suite.Run(t, new(ReadinessSuite)) }

// statusOf reads the current serving status for the unnamed ("") service.
func statusOf(t *testing.T, h *health.Server) healthpb.HealthCheckResponse_ServingStatus {
	t.Helper()
	resp, err := h.Check(t.Context(), &healthpb.HealthCheckRequest{})
	assert.NilError(t, err)
	return resp.GetStatus()
}

func (s *ReadinessSuite) TestFlipsToNotServingWhenProbeFails() {
	h := health.NewServer()
	h.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)

	var failing atomic.Bool
	failing.Store(true)

	ctx, cancel := context.WithCancel(s.T().Context())
	defer cancel()
	go grpcutil.WatchReadiness(ctx, grpcutil.ReadinessConfig{
		Service:  "test",
		Health:   h,
		Names:    []string{""},
		Interval: 5 * time.Millisecond,
		Probe: func(context.Context) error {
			if failing.Load() {
				return errors.New("dependency down")
			}
			return nil
		},
	})

	assert.Assert(s.T(), waitFor(func() bool {
		return statusOf(s.T(), h) == healthpb.HealthCheckResponse_NOT_SERVING
	}), "expected NOT_SERVING while the probe fails")

	failing.Store(false)
	assert.Assert(s.T(), waitFor(func() bool {
		return statusOf(s.T(), h) == healthpb.HealthCheckResponse_SERVING
	}), "expected SERVING once the probe recovers")
}

func (s *ReadinessSuite) TestNilHealthServerIsAllowed() {
	ctx, cancel := context.WithCancel(s.T().Context())
	defer cancel()
	done := make(chan struct{})
	go func() {
		grpcutil.WatchReadiness(ctx, grpcutil.ReadinessConfig{
			Service:  "worker",
			Interval: 5 * time.Millisecond,
			Probe:    func(context.Context) error { return nil },
		})
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		s.T().Fatal("WatchReadiness did not return on ctx cancellation")
	}
}

// TestNilHealthServerSurvivesFailingProbeTransition covers the mesh-worker
// shape: no gRPC health server, and a probe that fails from the start (so
// the very first check() call is a not-ready transition, since last starts
// true). cfg.Names is deliberately non-empty so that, if the
// `cfg.Health == nil` guard were ever dropped or moved after the loop, this
// test would panic on a nil *health.Server dereference instead of passing
// vacuously. A second probe call proves the ticker survived that branch.
func (s *ReadinessSuite) TestNilHealthServerSurvivesFailingProbeTransition() {
	calls := make(chan struct{}, 2)
	ctx, cancel := context.WithCancel(s.T().Context())
	defer cancel()

	go grpcutil.WatchReadiness(ctx, grpcutil.ReadinessConfig{
		Service:  "worker",
		Names:    []string{""},
		Interval: 5 * time.Millisecond,
		Probe: func(context.Context) error {
			select {
			case calls <- struct{}{}:
			default:
			}
			return errors.New("dependency down")
		},
	})

	for range 2 {
		select {
		case <-calls:
		case <-time.After(time.Second):
			s.T().Fatal("probe was not called twice; nil-Health branch may have panicked or hung")
		}
	}
}

// waitFor polls cond every millisecond for up to a second.
func waitFor(cond func() bool) bool {
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(time.Millisecond)
	}
	return false
}
