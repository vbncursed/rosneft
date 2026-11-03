package grpcerr_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type RefusedSuite struct {
	suite.Suite
}

func TestRefusedSuite(t *testing.T) { suite.Run(t, new(RefusedSuite)) }

// assertRefusal checks that got is a Refusal carrying msg, matching sentinel.
func (s *RefusedSuite) assertRefusal(got, sentinel error, msg string) {
	_, ok := errors.AsType[grpcerr.Refusal](got)
	assert.Assert(s.T(), ok, "not a Refusal: %v", got)
	assert.Assert(s.T(), errors.Is(got, sentinel), "%v is not %v", got, sentinel)
	assert.Equal(s.T(), got.Error(), msg)
}

func (s *RefusedSuite) TestRefusals() {
	for _, tc := range []struct {
		name     string
		err      error
		sentinel error
		msg      string
	}{
		{
			"not found names the territory", status.Error(codes.NotFound, "territory not found: t1"),
			domain.ErrTerritoryNotFound, "territory not found: t1",
		},
		{
			"not found falls back", status.Error(codes.NotFound, "no such row"),
			domain.ErrPanoramaNotFound, "no such row",
		},
		{
			"invalid argument", status.Error(codes.InvalidArgument, "invalid input: phase \"x\""),
			domain.ErrInvalidInput, "invalid input: phase \"x\"",
		},
	} {
		s.Run(tc.name, func() {
			got := grpcerr.Refused("content.X", tc.err, domain.ErrPanoramaNotFound, domain.ErrTerritoryNotFound)
			s.assertRefusal(got, tc.sentinel, tc.msg)
		})
	}
}

// A message naming two of the sentinels maps to the first of them in named's
// order, not in the message's.
func (s *RefusedSuite) TestFirstNamedSentinelWins() {
	err := status.Error(codes.NotFound, "placement not found: model not found")

	got := grpcerr.Refused(
		"catalog.X",
		err,
		domain.ErrTerritoryNotFound,
		domain.ErrModelNotFound,
		domain.ErrPlacementNotFound,
	)

	s.assertRefusal(got, domain.ErrModelNotFound, "placement not found: model not found")
	assert.Assert(s.T(), !errors.Is(got, domain.ErrPlacementNotFound))
}

func (s *RefusedSuite) TestOtherFailuresAreWrappedWithTheOp() {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"internal stays internal", status.Error(codes.Internal, "internal: boom")},
		{"not a status", errors.New("dial")},
	} {
		s.Run(tc.name, func() {
			got := grpcerr.Refused("content.X", tc.err, domain.ErrPanoramaNotFound, domain.ErrTerritoryNotFound)

			_, ok := errors.AsType[grpcerr.Refusal](got)
			assert.Assert(s.T(), !ok)
			assert.Assert(s.T(), errors.Is(got, tc.err))
			assert.Assert(s.T(), strings.HasPrefix(got.Error(), "content.X: "))
		})
	}
}

type MapStatusSuite struct {
	suite.Suite
}

func TestMapStatusSuite(t *testing.T) { suite.Run(t, new(MapStatusSuite)) }

func (s *MapStatusSuite) TestMapping() {
	notFound := errors.New("missing")
	plain := errors.New("connection failed")
	for _, tc := range []struct {
		name        string
		err         error
		sentinel    error
		passthrough bool
	}{
		{name: "nil"},
		{name: "not found", err: status.Error(codes.NotFound, "missing row"), sentinel: notFound},
		{name: "invalid argument", err: status.Error(codes.InvalidArgument, "bad input"), sentinel: domain.ErrInvalidInput},
		{name: "other status", err: status.Error(codes.Unavailable, "offline"), passthrough: true},
		{name: "non-status error", err: plain, passthrough: true},
	} {
		s.Run(tc.name, func() {
			t := s.T()
			got := grpcerr.MapStatus(tc.err, notFound)
			if tc.err == nil {
				assert.NilError(t, got)
				return
			}
			assert.Assert(t, errors.Is(got, tc.err))
			if tc.sentinel != nil {
				assert.Assert(t, errors.Is(got, tc.sentinel))
			}
			if tc.passthrough {
				assert.Equal(t, got, tc.err)
			}
		})
	}
}
