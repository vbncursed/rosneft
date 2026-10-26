// In-package test: tagWriteCC stands in for the unexported gRPC client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type tagWriteCC struct {
	catalogv1.CatalogServiceClient
	err    error
	create *catalogv1.CreateModelTagRequest
	update *catalogv1.UpdateModelTagRequest
}

func (t *tagWriteCC) CreateModelTag(
	_ context.Context, in *catalogv1.CreateModelTagRequest, _ ...grpc.CallOption,
) (*catalogv1.CreateModelTagResponse, error) {
	t.create = in
	return &catalogv1.CreateModelTagResponse{Tag: &catalogv1.ModelTag{Slug: in.GetSlug(), Title: in.GetTitle()}}, t.err
}

func (t *tagWriteCC) UpdateModelTag(
	_ context.Context, in *catalogv1.UpdateModelTagRequest, _ ...grpc.CallOption,
) (*catalogv1.UpdateModelTagResponse, error) {
	t.update = in
	return &catalogv1.UpdateModelTagResponse{Tag: &catalogv1.ModelTag{Slug: in.GetSlug(), Title: in.GetTitle()}}, t.err
}

type ModelTagWritesSuite struct{ suite.Suite }

func TestModelTagWritesSuite(t *testing.T) { suite.Run(t, new(ModelTagWritesSuite)) }

func (s *ModelTagWritesSuite) TestCreateSendsSlugAndTitle() {
	cc := &tagWriteCC{}

	got, err := (&Client{cc: cc}).CreateModelTag(s.T().Context(), "welding", "Welding")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.create.GetSlug(), "welding")
	assert.DeepEqual(s.T(), got, domain.ModelTag{Slug: "welding", Title: "Welding"})
}

func (s *ModelTagWritesSuite) TestUpdateSendsSlugAndTitle() {
	cc := &tagWriteCC{}

	got, err := (&Client{cc: cc}).UpdateModelTag(s.T().Context(), "camp", "Camps")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.update.GetSlug(), "camp")
	assert.Equal(s.T(), got.Title, "Camps")
}

func (s *ModelTagWritesSuite) TestRefusalsKeepTheCatalogsWords() {
	cc := &tagWriteCC{err: status.Error(codes.InvalidArgument, "invalid input: the ungrouped tag cannot be changed")}
	_, err := (&Client{cc: cc}).UpdateModelTag(s.T().Context(), "ungrouped", "X")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.Equal(s.T(), err.Error(), "invalid input: the ungrouped tag cannot be changed")

	cc = &tagWriteCC{err: status.Error(codes.NotFound, "model tag not found")}
	_, err = (&Client{cc: cc}).UpdateModelTag(s.T().Context(), "nope", "X")
	assert.ErrorIs(s.T(), err, domain.ErrModelTagNotFound)
}

func (s *ModelTagWritesSuite) TestInternalFailureIsNotARefusal() {
	cc := &tagWriteCC{err: status.Error(codes.Internal, "internal: pq: boom")}
	_, err := (&Client{cc: cc}).CreateModelTag(s.T().Context(), "ab", "X")
	_, isRefusal := errorsAsRefusal(err)
	assert.Assert(s.T(), err != nil && !isRefusal)
}
