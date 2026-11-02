// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type ZonesSuite struct{ suite.Suite }

func TestZonesSuite(t *testing.T) { suite.Run(t, new(ZonesSuite)) }

func (s *ZonesSuite) TestListModelTags() {
	got, err := (&Client{cc: &zoneCC{}}).ListModelTags(s.T().Context())

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []domain.ModelTag{{Slug: "camp", Title: "Camp"}})
}

func (s *ZonesSuite) TestListZonesMapsTheWireZone() {
	got, err := (&Client{cc: &zoneCC{}}).ListZones(s.T().Context(), "yard")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []domain.Zone{{
		ID: 7, Title: "Camp",
		Corners:       []domain.Vec3{{X: 1}, {X: 2}, {X: 3}, {X: 4}},
		Tags:          []domain.ModelTag{{Slug: "camp", Title: "Camp & accommodation"}},
		DrawingWidthM: new(30.5), CreatedAt: zoneStamp, UpdatedAt: zoneStamp,
	}})
	assert.Assert(s.T(), got[0].DrawingHeightM == nil, "an unknown drawing size stays nil")
}

// A catalog without the RPC (a gateway deployed ahead of it, or a catalog rolled
// back) is no zones: the scene still loads.
func (s *ZonesSuite) TestListZonesOnAnOldCatalogIsNoZones() {
	got, err := (&Client{cc: &zoneCC{err: status.Error(codes.Unimplemented, "no")}}).ListZones(s.T().Context(), "yard")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ZonesSuite) TestListZonesOfAnUnknownTerritoryIsNotFound() {
	cc := &zoneCC{err: status.Error(codes.NotFound, "territory not found")}

	_, err := (&Client{cc: cc}).ListZones(s.T().Context(), "x")

	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

func (s *ZonesSuite) TestCreateSendsTheBodyUnderTheSlug() {
	cc := &zoneCC{}
	in := domain.ZoneCreate{
		Title: "Camp", Corners: []domain.Vec3{{X: 1}, {X: 2}, {X: 3}, {X: 4}},
		TagSlugs: []string{"camp"}, DrawingWidthM: new(30.5),
	}

	got, err := (&Client{cc: cc}).CreateZone(s.T().Context(), "yard", in)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ID, int64(7))
	assert.Equal(s.T(), cc.create.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), cc.create.GetTitle(), "Camp")
	assert.Equal(s.T(), len(cc.create.GetCorners()), 4)
	assert.DeepEqual(s.T(), cc.create.GetTagSlugs(), []string{"camp"})
	assert.Equal(s.T(), cc.create.GetDrawingWidthM(), 30.5)
	assert.Assert(s.T(), cc.create.DrawingHeightM == nil)
}

// The catalog's own words reach the caller: the 400 body is in English and
// starts at the sentinel, with no gRPC framing.
func (s *ZonesSuite) TestCreateRefusalKeepsTheCatalogsWords() {
	cc := &zoneCC{err: status.Error(codes.InvalidArgument, "invalid input: ungrouped cannot be put on a zone")}

	_, err := (&Client{cc: cc}).CreateZone(s.T().Context(), "yard", domain.ZoneCreate{})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.Equal(s.T(), err.Error(), "invalid input: ungrouped cannot be put on a zone")
	_, isRefusal := errorsAsRefusal(err)
	assert.Assert(s.T(), isRefusal)
}

func errorsAsRefusal(err error) (grpcerr.Refusal, bool) { return errors.AsType[grpcerr.Refusal](err) }

func (s *ZonesSuite) TestUpdateSendsTitleAndTagsOnlyWhenSet() {
	cc := &zoneCC{}
	c := &Client{cc: cc}
	ctx := s.T().Context()

	_, err := c.UpdateZone(ctx, "yard", 7, domain.ZonePatch{Title: new("Camp 2")})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.update.GetTitle(), "Camp 2")
	assert.Assert(s.T(), !cc.update.GetSetTags())

	_, err = c.UpdateZone(ctx, "yard", 7, domain.ZonePatch{TagSlugs: []string{"power"}, SetTags: true})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), cc.update.Title == nil)
	assert.Assert(s.T(), cc.update.GetSetTags())
	assert.DeepEqual(s.T(), cc.update.GetTagSlugs(), []string{"power"})
	assert.Equal(s.T(), cc.update.GetId(), int64(7))
}

// A zone of another territory answers NotFound from the catalog; the gateway
// reads it as its own zone sentinel, not as a missing territory.
func (s *ZonesSuite) TestForeignZoneIsZoneNotFound() {
	cc := &zoneCC{err: status.Error(codes.NotFound, "zone not found")}
	c := &Client{cc: cc}

	_, err := c.UpdateZone(s.T().Context(), "yard", 7, domain.ZonePatch{})
	assert.ErrorIs(s.T(), err, domain.ErrZoneNotFound)
	assert.ErrorIs(s.T(), c.DeleteZone(s.T().Context(), "yard", 7), domain.ErrZoneNotFound)
	assert.Equal(s.T(), cc.del.GetTerritorySlug(), "yard")
}

// A failure that is no refusal keeps its detail for the log and shows no
// refusal to the caller.
func (s *ZonesSuite) TestInternalFailureIsNotARefusal() {
	cc := &zoneCC{err: status.Error(codes.Internal, "internal: pq: boom")}

	_, err := (&Client{cc: cc}).CreateZone(s.T().Context(), "yard", domain.ZoneCreate{})

	_, isRefusal := errorsAsRefusal(err)
	assert.Assert(s.T(), !isRefusal)
	assert.ErrorContains(s.T(), err, "catalog.CreateZone")
}
