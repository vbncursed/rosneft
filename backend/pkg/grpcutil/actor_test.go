package grpcutil

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"gotest.tools/v3/assert"
)

type ActorSuite struct {
	suite.Suite
}

func TestActorSuite(t *testing.T) {
	suite.Run(t, new(ActorSuite))
}

func (s *ActorSuite) TestFromMetadataPopulatesContext() {
	md := metadata.Pairs(ActorIDHeader, "user-1", ActorCompanyHeader, "company-1")
	ctx := metadata.NewIncomingContext(s.T().Context(), md)

	got := ActorFromContext(withActorFromMetadata(ctx))

	assert.Equal(s.T(), got.ID, "user-1")
	assert.Equal(s.T(), got.Company, "company-1")
}

func (s *ActorSuite) TestNoMetadataLeavesActorEmpty() {
	got := ActorFromContext(withActorFromMetadata(s.T().Context()))

	assert.Equal(s.T(), got.ID, "")
	assert.Equal(s.T(), got.Company, "")
}

// A Root has no company: the id must still survive so the audit row is
// attributed, with company_id left NULL.
func (s *ActorSuite) TestRootCarriesIDWithoutCompany() {
	md := metadata.Pairs(ActorIDHeader, "root-1")
	ctx := metadata.NewIncomingContext(s.T().Context(), md)

	got := ActorFromContext(withActorFromMetadata(ctx))

	assert.Equal(s.T(), got.ID, "root-1")
	assert.Equal(s.T(), got.Company, "")
}

func (s *ActorSuite) TestClientInterceptorForwardsActor() {
	ctx := WithActor(s.T().Context(), Actor{ID: "user-1", Company: "company-1"})
	var seen metadata.MD

	invoker := func(ctx context.Context, _ string, _, _ any, _ *grpc.ClientConn, _ ...grpc.CallOption) error {
		seen, _ = metadata.FromOutgoingContext(ctx)
		return nil
	}
	err := ActorClientInterceptor()(ctx, "/svc/Method", nil, nil, nil, invoker)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), seen.Get(ActorIDHeader)[0], "user-1")
	assert.Equal(s.T(), seen.Get(ActorCompanyHeader)[0], "company-1")
}

// Background work (the mesh-worker reconciler, migrations) carries no actor.
// The interceptor must stay out of the way rather than sending empty headers.
func (s *ActorSuite) TestClientInterceptorSendsNothingWithoutActor() {
	var seen metadata.MD
	var hadMD bool

	invoker := func(ctx context.Context, _ string, _, _ any, _ *grpc.ClientConn, _ ...grpc.CallOption) error {
		seen, hadMD = metadata.FromOutgoingContext(ctx)
		return nil
	}
	err := ActorClientInterceptor()(s.T().Context(), "/svc/Method", nil, nil, nil, invoker)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !hadMD || len(seen.Get(ActorIDHeader)) == 0)
}
