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

type ZonesSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestZonesSuite(t *testing.T) { suite.Run(t, new(ZonesSuite)) }

func (s *ZonesSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

var (
	squareCorners = [4]domain.Vec3{{X: 0}, {X: 1}, {X: 1, Z: 1}, {Z: 1}}
	n2Zone        = domain.Zone{
		ID: 3, Title: "N2 Area", Corners: squareCorners,
		Tags:          []domain.ModelTag{{ID: 6, Slug: "nitrogen", Title: "Nitrogen & gas"}},
		DrawingWidthM: new(7.5),
	}
)

func protoCorners() []*catalogv1.Vec3 {
	out := make([]*catalogv1.Vec3, len(squareCorners))
	for i, c := range squareCorners {
		out[i] = &catalogv1.Vec3{X: c.X, Y: c.Y, Z: c.Z}
	}
	return out
}

func (s *ZonesSuite) TestCreateForwardsTheBodyAndAnswersTheZone() {
	s.svc.CreateZoneMock.Expect(s.ctx, "t1", domain.ZoneCreate{
		Title: "N2 Area", Corners: squareCorners, TagSlugs: []string{"nitrogen"}, DrawingWidthM: new(7.5),
	}).Return(n2Zone, nil)
	out, err := s.srv.CreateZone(s.ctx, &catalogv1.CreateZoneRequest{
		TerritorySlug: "t1", Title: "N2 Area", Corners: protoCorners(),
		TagSlugs: []string{"nitrogen"}, DrawingWidthM: new(7.5),
	})
	assert.NilError(s.T(), err)
	z := out.GetZone()
	assert.Equal(s.T(), z.GetId(), int64(3))
	assert.Equal(s.T(), len(z.GetCorners()), 4)
	assert.Equal(s.T(), z.GetCorners()[2].GetZ(), 1.0)
	assert.Equal(s.T(), z.GetTags()[0].GetSlug(), "nitrogen")
	assert.Equal(s.T(), z.GetDrawingWidthM(), 7.5)
	assert.Assert(s.T(), z.DrawingHeightM == nil, "an unknown size is an absent field, not 0")
}

// A zone has exactly four corners: anything else is refused before the service.
func (s *ZonesSuite) TestCreateRefusesAWrongCornerCount() {
	_, err := s.srv.CreateZone(s.ctx, &catalogv1.CreateZoneRequest{
		TerritorySlug: "t1", Title: "x", Corners: protoCorners()[:3], TagSlugs: []string{"camp"},
	})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
	assert.Equal(s.T(), status.Convert(err).Message(), "invalid input: a zone has 4 corners, got 3")
}

func (s *ZonesSuite) TestUpdateCarriesTitleAndTagsOnlyWhenSet() {
	s.svc.UpdateZoneMock.Expect(s.ctx, "t1", int64(3), domain.ZonePatch{Title: new("Camp")}).Return(n2Zone, nil)
	_, err := s.srv.UpdateZone(s.ctx, &catalogv1.UpdateZoneRequest{TerritorySlug: "t1", Id: 3, Title: new("Camp")})
	assert.NilError(s.T(), err)

	s.svc.UpdateZoneMock.Expect(s.ctx, "t1", int64(3), domain.ZonePatch{SetTags: true, TagSlugs: []string{"camp"}}).
		Return(n2Zone, nil)
	_, err = s.srv.UpdateZone(
		s.ctx,
		&catalogv1.UpdateZoneRequest{TerritorySlug: "t1", Id: 3, TagSlugs: []string{"camp"}, SetTags: true},
	)
	assert.NilError(s.T(), err)
}

func (s *ZonesSuite) TestListAndDelete() {
	s.svc.ListZonesMock.Expect(s.ctx, "t1").Return([]domain.Zone{n2Zone}, nil)
	listed, err := s.srv.ListZones(s.ctx, &catalogv1.ListZonesRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed.GetZones()), 1)

	s.svc.DeleteZoneMock.Expect(s.ctx, "t1", int64(3)).Return(nil)
	_, err = s.srv.DeleteZone(s.ctx, &catalogv1.DeleteZoneRequest{TerritorySlug: "t1", Id: 3})
	assert.NilError(s.T(), err)
}

// The gateway puts the message in the browser's body, so it starts at the sentinel.
func (s *ZonesSuite) TestRefusalsMapToTheirCodes() {
	s.svc.UpdateZoneMock.Return(domain.Zone{}, fmt.Errorf("storage.UpdateZone: %w", domain.ErrZoneNotFound))
	_, err := s.srv.UpdateZone(s.ctx, &catalogv1.UpdateZoneRequest{TerritorySlug: "t2", Id: 3})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
	assert.Equal(s.T(), status.Convert(err).Message(), "zone not found")

	s.svc.DeleteZoneMock.Return(domain.ErrZoneNotFound)
	_, err = s.srv.DeleteZone(s.ctx, &catalogv1.DeleteZoneRequest{TerritorySlug: "t2", Id: 3})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)

	s.svc.CreateZoneMock.Return(
		domain.Zone{},
		fmt.Errorf("service.CreateZone: %w: unknown model tag", domain.ErrInvalidInput),
	)
	_, err = s.srv.CreateZone(s.ctx, &catalogv1.CreateZoneRequest{TerritorySlug: "t1", Corners: protoCorners()})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
	assert.Equal(s.T(), status.Convert(err).Message(), "invalid input: unknown model tag")
}
