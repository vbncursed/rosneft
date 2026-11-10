package auth

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcmock"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type ResolveLabelsSuite struct {
	suite.Suite
	cc      *grpcmock.ClientConnInterfaceMock
	cli     *Client
	ctx     context.Context
	request *authv1.ResolveLabelsRequest
	labels  map[string]string
	err     error
}

func TestResolveLabelsSuite(t *testing.T) { suite.Run(t, new(ResolveLabelsSuite)) }

func (s *ResolveLabelsSuite) SetupTest() {
	s.ctx, s.request, s.labels, s.err = nil, nil, nil, nil
	s.cc = grpcmock.NewClientConnInterfaceMock(minimock.NewController(s.T()))
	s.cli = &Client{cc: authv1.NewAuthServiceClient(s.cc)}
	s.cc.InvokeMock.Optional().
		Set(func(ctx context.Context, method string, req, reply any, _ ...grpc.CallOption) error {
			assert.Equal(s.T(), method, authv1.AuthService_ResolveLabels_FullMethodName)
			s.ctx = ctx
			s.request = req.(*authv1.ResolveLabelsRequest)
			reply.(*authv1.ResolveLabelsResponse).Labels = s.labels
			return s.err
		})
}

func (s *ResolveLabelsSuite) TestEmptySkipsRPC() {
	got, err := s.cli.ResolveLabels(s.T().Context(), "token", nil)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string]string{})
	assert.Equal(s.T(), s.cc.InvokeBeforeCounter(), uint64(0))
}

func (s *ResolveLabelsSuite) TestRequestAndResponse() {
	ctx := s.T().Context()
	refs := []domain.LabelRef{{Kind: "role", ID: "r1"}, {Kind: "permission", ID: "p2"}, {Kind: "role", ID: "r1"}}
	s.labels = map[string]string{"role:r1": "Admin", "permission:p2": "Read"}
	got, err := s.cli.ResolveLabels(ctx, "session-token", refs)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cc.InvokeBeforeCounter(), uint64(1))
	assert.Assert(s.T(), s.ctx == ctx)
	assert.Equal(s.T(), s.request.GetToken(), "session-token")
	wire := s.request.GetRefs()
	assert.Equal(s.T(), len(wire), 3)
	for i, ref := range refs {
		assert.Equal(s.T(), wire[i].GetKind(), ref.Kind)
		assert.Equal(s.T(), wire[i].GetId(), ref.ID)
	}
	assert.DeepEqual(s.T(), got, s.labels)
}

func (s *ResolveLabelsSuite) TestErrorMapsAndWraps() {
	cause := status.Error(codes.InvalidArgument, "bad refs")
	s.err = cause
	got, err := s.cli.ResolveLabels(s.T().Context(), "token", []domain.LabelRef{{ID: "1"}})
	assert.Assert(s.T(), got == nil)
	assert.Equal(s.T(), s.cc.InvokeBeforeCounter(), uint64(1))
	assert.ErrorContains(s.T(), err, "auth.ResolveLabels:")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	assert.Assert(s.T(), errors.Is(err, cause))
	assert.Assert(s.T(), strings.Contains(err.Error(), "bad refs"))
}
