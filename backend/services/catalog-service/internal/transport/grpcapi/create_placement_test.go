package grpcapi_test

import (
	"errors"
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

type CreatePlacementSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
}

func TestCreatePlacementSuite(t *testing.T) { suite.Run(t, new(CreatePlacementSuite)) }

func (s *CreatePlacementSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
}

// The gateway puts a refusal's message in the browser's 400 body, so it starts
// at the sentinel: "service.CreatePlacement:" is this process's business.
func (s *CreatePlacementSuite) TestARefusalStartsAtItsSentinel() {
	s.svc.CreatePlacementMock.Return(domain.Placement{}, fmt.Errorf("service.CreatePlacement: %w",
		fmt.Errorf("%w: panorama 5 is not on territory %q", domain.ErrInvalidInput, "yard")))

	_, err := grpcapi.New(s.svc).CreatePlacement(s.T().Context(), &catalogv1.CreatePlacementRequest{TerritorySlug: "yard"})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
	assert.Equal(s.T(), status.Convert(err).Message(), `invalid input: panorama 5 is not on territory "yard"`)
}

// An internal failure keeps its detail: only the gateway, which logs it and
// answers a fixed body, ever reads it.
func (s *CreatePlacementSuite) TestAnInternalFailureKeepsItsDetail() {
	s.svc.CreatePlacementMock.Return(domain.Placement{}, fmt.Errorf("storage.CreatePlacement: %w", errors.New("conn reset")))

	_, err := grpcapi.New(s.svc).CreatePlacement(s.T().Context(), &catalogv1.CreatePlacementRequest{TerritorySlug: "yard"})
	assert.Equal(s.T(), status.Code(err), codes.Internal)
	assert.Equal(s.T(), status.Convert(err).Message(), "internal: storage.CreatePlacement: conn reset")
}
