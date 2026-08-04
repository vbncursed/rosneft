package grpcutil_test

import (
	"net"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

type HealthcheckSuite struct{ suite.Suite }

func TestHealthcheckSuite(t *testing.T) { suite.Run(t, new(HealthcheckSuite)) }

func (s *HealthcheckSuite) TestPassesAgainstAServingServer() {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	h := health.NewServer()
	h.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, h)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	assert.NilError(s.T(), grpcutil.CheckHealth(s.T().Context(), lis.Addr().String()))
}

func (s *HealthcheckSuite) TestFailsAgainstNotServing() {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	h := health.NewServer()
	h.SetServingStatus("", healthpb.HealthCheckResponse_NOT_SERVING)
	healthpb.RegisterHealthServer(srv, h)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	assert.ErrorContains(s.T(), grpcutil.CheckHealth(s.T().Context(), lis.Addr().String()), "NOT_SERVING")
}

func (s *HealthcheckSuite) TestFailsAgainstNothing() {
	assert.Assert(s.T(), grpcutil.CheckHealth(s.T().Context(), "127.0.0.1:1") != nil)
}
