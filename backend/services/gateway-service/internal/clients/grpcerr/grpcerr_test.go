package grpcerr_test

import (
	"errors"
	"strings"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func TestRefused(t *testing.T) {
	for _, tc := range []struct {
		name     string
		err      error
		sentinel error // nil: not a Refusal
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
		{"internal stays internal", status.Error(codes.Internal, "internal: boom"), nil, ""},
		{"not a status", errors.New("dial"), nil, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := grpcerr.Refused("content.X", tc.err, domain.ErrPanoramaNotFound, domain.ErrTerritoryNotFound)
			var r grpcerr.Refusal
			if tc.sentinel == nil {
				assert.Assert(t, !errors.As(got, &r))
				assert.Assert(t, strings.HasPrefix(got.Error(), "content.X: "))
				return
			}
			assert.Assert(t, errors.As(got, &r))
			assert.Assert(t, errors.Is(got, tc.sentinel))
			assert.Equal(t, got.Error(), tc.msg)
		})
	}
}
