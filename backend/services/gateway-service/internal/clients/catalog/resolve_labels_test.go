package catalog

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcmock"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type ResolveLabelsSuite struct {
	suite.Suite
	cc      *grpcmock.ClientConnInterfaceMock
	cli     *Client
	ctx     context.Context
	request *catalogv1.ResolveLabelsRequest
	labels  map[string]string
	err     error
}

func TestResolveLabelsSuite(t *testing.T) { suite.Run(t, new(ResolveLabelsSuite)) }

func (s *ResolveLabelsSuite) SetupTest() {
	s.ctx, s.request, s.labels, s.err = nil, nil, nil, nil
	s.cc = grpcmock.NewClientConnInterfaceMock(minimock.NewController(s.T()))
	s.cli = &Client{cc: catalogv1.NewCatalogServiceClient(s.cc)}
	s.cc.InvokeMock.Optional().
		Set(func(ctx context.Context, method string, req, reply any, _ ...grpc.CallOption) error {
			assert.Equal(s.T(), method, catalogv1.CatalogService_ResolveLabels_FullMethodName)
			s.ctx = ctx
			s.request = req.(*catalogv1.ResolveLabelsRequest)
			reply.(*catalogv1.ResolveLabelsResponse).Labels = s.labels
			return s.err
		})
}

func (s *ResolveLabelsSuite) TestEmptyAndInvalidSkipRPC() {
	for _, refs := range [][]domain.LabelRef{nil, {}, {{ID: ""}, {ID: "x"}, {ID: "9223372036854775808"}, {ID: "-9223372036854775809"}}} {
		got, err := s.cli.ResolveLabels(s.T().Context(), refs)
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got, map[string]string{})
		assert.Equal(s.T(), s.cc.InvokeBeforeCounter(), uint64(0))
	}
}

func (s *ResolveLabelsSuite) TestFiltersAndPreservesOrderAndDuplicates() {
	ctx := s.T().Context()
	refs := []domain.LabelRef{
		{Kind: "territory", ID: "42"},
		{Kind: "bad", ID: "x"},
		{Kind: "model", ID: "-9223372036854775808"},
		{Kind: "bad", ID: "9223372036854775808"},
		{Kind: "territory", ID: "42"},
		{Kind: "panorama", ID: "+9223372036854775807"},
	}
	s.labels = map[string]string{"territory:42": "Yard"}
	got, err := s.cli.ResolveLabels(ctx, refs)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cc.InvokeBeforeCounter(), uint64(1))
	assert.Assert(s.T(), s.ctx == ctx)
	wire := s.request.GetRefs()
	assert.Equal(s.T(), len(wire), 4)
	assert.DeepEqual(
		s.T(),
		[]string{wire[0].GetKind(), wire[1].GetKind(), wire[2].GetKind(), wire[3].GetKind()},
		[]string{"territory", "model", "territory", "panorama"},
	)
	assert.DeepEqual(
		s.T(),
		[]int64{wire[0].GetId(), wire[1].GetId(), wire[2].GetId(), wire[3].GetId()},
		[]int64{42, -9223372036854775808, 42, 9223372036854775807},
	)
	assert.DeepEqual(s.T(), got, s.labels)
}

func (s *ResolveLabelsSuite) TestErrorMapsAndWraps() {
	cause := status.Error(codes.InvalidArgument, "bad refs")
	s.err = cause
	got, err := s.cli.ResolveLabels(s.T().Context(), []domain.LabelRef{{ID: "1"}})
	assert.Assert(s.T(), got == nil)
	assert.Equal(s.T(), s.cc.InvokeBeforeCounter(), uint64(1))
	assert.ErrorContains(s.T(), err, "catalog.ResolveLabels:")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	assert.Assert(s.T(), errors.Is(err, cause))
}
