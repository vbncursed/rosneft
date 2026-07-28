// In-package test: it substitutes the unexported gRPC stub on Client.
package audit

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// stubCC fails every call with a fixed status — the only thing these tests need.
// Hand-written rather than minimock-generated: the interface belongs to the
// generated proto package, which carries no //go:generate directive of ours, and
// a four-line stub is cheaper than adding one to a generated file.
type stubCC struct {
	auditv1.AuditServiceClient
	err error
}

func (s stubCC) ListEntries(
	context.Context, *auditv1.ListEntriesRequest, ...grpc.CallOption,
) (*auditv1.ListEntriesResponse, error) {
	return nil, s.err
}

type EntriesSuite struct {
	suite.Suite
}

func TestEntriesSuite(t *testing.T) {
	suite.Run(t, new(EntriesSuite))
}

// A rejected filter has to reach the HTTP layer as the gateway's own sentinel.
// Without grpcerr.MapStatus the bare gRPC status arrives instead, isInvalid()
// compares it against that sentinel, misses, and the journal answers 500 to
// what is plainly a bad request.
func (s *EntriesSuite) TestInvalidArgumentBecomesTheGatewaySentinel() {
	c := &Client{cc: stubCC{err: status.Error(codes.InvalidArgument, "actor id must be a uuid")}}

	_, _, err := c.ListEntries(s.T().Context(), domain.AuditQuery{})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// Everything else stays a 500: a journal that is merely unreachable must not be
// reported to the caller as their mistake.
func (s *EntriesSuite) TestOtherCodesAreNotInvalidInput() {
	c := &Client{cc: stubCC{err: status.Error(codes.Unavailable, "audit service is down")}}

	_, _, err := c.ListEntries(s.T().Context(), domain.AuditQuery{})

	assert.Assert(s.T(), err != nil)
	assert.Assert(s.T(), !errors.Is(err, domain.ErrInvalidInput))
}
