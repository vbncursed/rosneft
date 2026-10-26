package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ZonesSuite drives the four zone handlers against a recording service: what
// reaches the service (slug, id, body) and which status and body come back.
type ZonesSuite struct {
	suite.Suite
	svc *zoneService
	srv *Server
}

func TestZonesSuite(t *testing.T) { suite.Run(t, new(ZonesSuite)) }

func (s *ZonesSuite) SetupTest() {
	s.svc = &zoneService{}
	s.srv = New(s.svc)
}

// zoneService records what each call was handed and answers with err; anything
// else panics through the embedded nil Service.
type zoneService struct {
	Service
	err    error
	slug   string
	id     int64
	create domain.ZoneCreate
	patch  domain.ZonePatch
}

var zoneStamp = time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC)

func (z *zoneService) zone() domain.Zone {
	return domain.Zone{
		ID: 7, Title: "Camp", CreatedAt: zoneStamp, UpdatedAt: zoneStamp,
		Corners: []domain.Vec3{{X: 1}, {X: 2}, {X: 3}, {X: 4}},
		Tags:    []domain.ModelTag{{Slug: "camp", Title: "Camp & accommodation"}},
	}
}

func (z *zoneService) ListZones(_ context.Context, slug string) ([]domain.Zone, error) {
	z.slug = slug
	if z.err != nil {
		return nil, z.err
	}
	return []domain.Zone{z.zone()}, nil
}

func (z *zoneService) CreateZone(_ context.Context, slug string, in domain.ZoneCreate) (domain.Zone, error) {
	z.slug, z.create = slug, in
	return z.zone(), z.err
}

func (z *zoneService) UpdateZone(_ context.Context, slug string, id int64, p domain.ZonePatch) (domain.Zone, error) {
	z.slug, z.id, z.patch = slug, id, p
	return z.zone(), z.err
}

func (z *zoneService) DeleteZone(_ context.Context, slug string, id int64) error {
	z.slug, z.id = slug, id
	return z.err
}

// rendered is what the wire carries for a response object.
func rendered(t *testing.T, visit func(http.ResponseWriter) error) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	assert.NilError(t, visit(rec))
	return rec.Code, rec.Body.String()
}

func (s *ZonesSuite) TestCreateAnswers201WithTheZoneShape() {
	w := 30.5
	resp, err := s.srv.CreateZone(s.T().Context(), CreateZoneRequestObject{Slug: "yard", Body: &CreateZoneJSONRequestBody{
		Title: "Camp", Corners: []Vec3{{X: 1}, {X: 2}, {X: 3}, {X: 4}}, TagSlugs: []string{"camp"}, DrawingWidthM: &w,
	}})

	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), resp.VisitCreateZoneResponse)
	assert.Equal(s.T(), code, http.StatusCreated)
	// The drawing size is null, not absent, when the scale is unknown.
	for _, part := range []string{
		`"id":7`, `"title":"Camp"`, `"tags":[{"slug":"camp","title":"Camp \u0026 accommodation"}]`,
		`"drawingWidthM":null`, `"drawingHeightM":null`, `"createdAt":"2026-10-26T12:00:00Z"`,
	} {
		assert.Assert(s.T(), strings.Contains(body, part), "%s missing from %s", part, body)
	}
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.Equal(s.T(), s.svc.create.Title, "Camp")
	assert.DeepEqual(s.T(), s.svc.create.TagSlugs, []string{"camp"})
	assert.DeepEqual(s.T(), s.svc.create.DrawingWidthM, &w)
	assert.Equal(s.T(), len(s.svc.create.Corners), 4)
}

func (s *ZonesSuite) TestListAnswersTheZones() {
	resp, err := s.srv.ListZones(s.T().Context(), ListZonesRequestObject{Slug: "yard"})

	assert.NilError(s.T(), err)
	list, ok := resp.(ListZones200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), len(list), 1)
	assert.Equal(s.T(), list[0].Id, int64(7))
	assert.Equal(s.T(), s.svc.slug, "yard")
}

func (s *ZonesSuite) TestUpdateTagsPresentEvenWhenEmptyAreAReplacement() {
	for _, tc := range []struct {
		name string
		body UpdateZoneJSONRequestBody
		want domain.ZonePatch
	}{
		{"title only", UpdateZoneJSONRequestBody{Title: new("Camp 2")}, domain.ZonePatch{Title: new("Camp 2")}},
		{"tags", UpdateZoneJSONRequestBody{TagSlugs: &[]string{"power"}}, domain.ZonePatch{TagSlugs: []string{"power"}, SetTags: true}},
		{"empty tags are sent, so the catalog refuses them", UpdateZoneJSONRequestBody{TagSlugs: &[]string{}}, domain.ZonePatch{TagSlugs: []string{}, SetTags: true}},
	} {
		s.Run(tc.name, func() {
			resp, err := s.srv.UpdateZone(s.T().Context(), UpdateZoneRequestObject{Slug: "yard", Id: 7, Body: &tc.body})

			assert.NilError(s.T(), err)
			_, ok := resp.(UpdateZone200JSONResponse)
			assert.Assert(s.T(), ok, "got %T", resp)
			assert.DeepEqual(s.T(), s.svc.patch, tc.want)
			assert.Equal(s.T(), s.svc.id, int64(7))
		})
	}
}

func (s *ZonesSuite) TestDeleteAnswers204() {
	resp, err := s.srv.DeleteZone(s.T().Context(), DeleteZoneRequestObject{Slug: "yard", Id: 7})

	assert.NilError(s.T(), err)
	_, ok := resp.(DeleteZone204Response)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), s.svc.slug, "yard")
}

// A zone of another territory is the service's ErrZoneNotFound: 404 not_found,
// the same as an unknown id.
func (s *ZonesSuite) TestForeignZoneIdIs404() {
	s.svc.err = domain.ErrZoneNotFound
	ctx := s.T().Context()

	upd, err := s.srv.UpdateZone(ctx, UpdateZoneRequestObject{Slug: "yard", Id: 99, Body: &UpdateZoneJSONRequestBody{}})
	assert.NilError(s.T(), err)
	del, err := s.srv.DeleteZone(ctx, DeleteZoneRequestObject{Slug: "yard", Id: 99})
	assert.NilError(s.T(), err)

	for _, visit := range []func(http.ResponseWriter) error{upd.VisitUpdateZoneResponse, del.VisitDeleteZoneResponse} {
		code, body := rendered(s.T(), visit)
		assert.Equal(s.T(), code, http.StatusNotFound)
		assert.Assert(s.T(), strings.Contains(body, `"code":"not_found"`), body)
	}
}

func (s *ZonesSuite) TestMissingBodyIs400() {
	create, err := s.srv.CreateZone(s.T().Context(), CreateZoneRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	upd, err := s.srv.UpdateZone(s.T().Context(), UpdateZoneRequestObject{Slug: "yard", Id: 1})
	assert.NilError(s.T(), err)

	for _, visit := range []func(http.ResponseWriter) error{create.VisitCreateZoneResponse, upd.VisitUpdateZoneResponse} {
		code, body := rendered(s.T(), visit)
		assert.Equal(s.T(), code, http.StatusBadRequest)
		assert.Assert(s.T(), strings.Contains(body, `"code":"invalid_input"`), body)
	}
}
