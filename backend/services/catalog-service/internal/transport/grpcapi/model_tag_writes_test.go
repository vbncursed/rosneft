package grpcapi_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

type ModelTagWritesSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestModelTagWritesSuite(t *testing.T) { suite.Run(t, new(ModelTagWritesSuite)) }

func (s *ModelTagWritesSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

func (s *ModelTagWritesSuite) TestCreateAnswersTheTag() {
	s.svc.CreateModelTagMock.Expect(s.ctx, "welding", "Welding").
		Return(domain.ModelTag{ID: 9, Slug: "welding", Title: "Welding"}, nil)
	out, err := s.srv.CreateModelTag(s.ctx, &catalogv1.CreateModelTagRequest{Slug: "welding", Title: "Welding"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.GetTag().GetSlug(), "welding")
	assert.Equal(s.T(), out.GetTag().GetTitle(), "Welding")
}

func (s *ModelTagWritesSuite) TestUpdateAnswersTheTag() {
	s.svc.UpdateModelTagMock.Expect(s.ctx, "camp", "Camps").
		Return(domain.ModelTag{Slug: "camp", Title: "Camps"}, nil)
	out, err := s.srv.UpdateModelTag(s.ctx, &catalogv1.UpdateModelTagRequest{Slug: "camp", Title: "Camps"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.GetTag().GetTitle(), "Camps")
}

func (s *ModelTagWritesSuite) TestRefusalsKeepTheirCodeAndStartAtTheSentinel() {
	s.svc.UpdateModelTagMock.Return(domain.ModelTag{}, fmt.Errorf("storage.UpdateModelTag: %w", domain.ErrModelTagNotFound))
	_, err := s.srv.UpdateModelTag(s.ctx, &catalogv1.UpdateModelTagRequest{Slug: "x", Title: "X"})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
	assert.Equal(s.T(), status.Convert(err).Message(), "model tag not found")

	s.svc.CreateModelTagMock.Return(domain.ModelTag{}, fmt.Errorf("service.CreateModelTag: %w: bad", domain.ErrInvalidInput))
	_, err = s.srv.CreateModelTag(s.ctx, &catalogv1.CreateModelTagRequest{Slug: "x", Title: "X"})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
	assert.Equal(s.T(), status.Convert(err).Message(), "invalid input: bad")
}
