package httpapi

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// MeasurementsSuite drives the five handlers against a recording service:
// what reaches the service (slug, id, points) and which status comes back.
type MeasurementsSuite struct {
	suite.Suite
	svc *measurementService
	srv *Server
}

func TestMeasurementsSuite(t *testing.T) { suite.Run(t, new(MeasurementsSuite)) }

func (s *MeasurementsSuite) SetupTest() {
	s.svc = &measurementService{}
	s.srv = New(s.svc)
}

// measurementService records the last measurement and slug it was handed and
// answers with err; anything else panics through the embedded nil Service.
type measurementService struct {
	Service
	err  error
	got  domain.Measurement
	slug string
	id   int64
}

var stamp = time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)

func (m *measurementService) echo(in domain.Measurement) (domain.Measurement, error) {
	m.got = in
	in.ID = cmp.Or(in.ID, 11)
	in.CreatedAt, in.UpdatedAt = stamp, stamp
	return in, m.err
}

func (m *measurementService) ListMeasurements(_ context.Context, slug string) ([]domain.Measurement, error) {
	m.slug = slug
	return []domain.Measurement{{
		ID: 4, TerritorySlug: slug, Closed: true, CreatedAt: stamp, UpdatedAt: stamp,
		Points: []domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}, {X: 7, Y: 8, Z: 9}},
	}}, m.err
}

func (m *measurementService) CreateMeasurement(_ context.Context, in domain.Measurement) (domain.Measurement, error) {
	return m.echo(in)
}

func (m *measurementService) UpdateMeasurement(_ context.Context, in domain.Measurement) (domain.Measurement, error) {
	return m.echo(in)
}

func (m *measurementService) DeleteMeasurement(_ context.Context, slug string, id int64) error {
	m.slug, m.id = slug, id
	return m.err
}

func (m *measurementService) DeleteMeasurements(_ context.Context, slug string) (int, error) {
	m.slug = slug
	return 3, m.err
}

var wirePoints = []Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}}

func (s *MeasurementsSuite) TestListRebuildsEachChain() {
	resp, err := s.srv.ListMeasurements(s.T().Context(), ListMeasurementsRequestObject{Slug: "yard"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.svc.slug, "yard")
	list, ok := resp.(ListMeasurements200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.DeepEqual(s.T(), []Measurement(list), []Measurement{{
		Id: 4, TerritorySlug: "yard", Closed: true, CreatedAt: stamp, UpdatedAt: stamp,
		Points: []Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}, {X: 7, Y: 8, Z: 9}},
	}})
}

func (s *MeasurementsSuite) TestCreateTakesTheSlugFromTheURL() {
	resp, err := s.srv.CreateMeasurement(s.T().Context(), CreateMeasurementRequestObject{
		Slug: "yard", Body: &CreateMeasurementJSONRequestBody{Points: wirePoints, Closed: true},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), s.svc.got, domain.Measurement{
		TerritorySlug: "yard", Closed: true,
		Points: []domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}},
	})
	created, ok := resp.(CreateMeasurement201JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), created.Id, int64(11))
	assert.DeepEqual(s.T(), created.Points, wirePoints)
}

func (s *MeasurementsSuite) TestUpdateTakesSlugAndIDFromTheURL() {
	resp, err := s.srv.UpdateMeasurement(s.T().Context(), UpdateMeasurementRequestObject{
		Slug: "yard", Id: 7, Body: &UpdateMeasurementJSONRequestBody{Points: wirePoints},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.svc.got.TerritorySlug, "yard")
	assert.Equal(s.T(), s.svc.got.ID, int64(7))
	assert.Equal(s.T(), len(s.svc.got.Points), 2)
	_, ok := resp.(UpdateMeasurement200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}

func (s *MeasurementsSuite) TestDeleteTakesSlugAndIDFromTheURL() {
	resp, err := s.srv.DeleteMeasurement(s.T().Context(), DeleteMeasurementRequestObject{Slug: "yard", Id: 7})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.Equal(s.T(), s.svc.id, int64(7))
	_, ok := resp.(DeleteMeasurement204Response)
	assert.Assert(s.T(), ok, "got %T", resp)
}

func (s *MeasurementsSuite) TestDeleteAllReportsTheCount() {
	resp, err := s.srv.DeleteMeasurements(s.T().Context(), DeleteMeasurementsRequestObject{Slug: "yard"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.DeepEqual(s.T(), resp, DeleteMeasurements200JSONResponse{Deleted: 3})
}

func (s *MeasurementsSuite) TestAMissingBodyIsABadRequest() {
	ctx := s.T().Context()
	created, err := s.srv.CreateMeasurement(ctx, CreateMeasurementRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	_, ok := created.(CreateMeasurement400JSONResponse)
	assert.Assert(s.T(), ok, "got %T", created)

	updated, err := s.srv.UpdateMeasurement(ctx, UpdateMeasurementRequestObject{Slug: "yard", Id: 7})
	assert.NilError(s.T(), err)
	_, ok = updated.(UpdateMeasurement400JSONResponse)
	assert.Assert(s.T(), ok, "got %T", updated)
}

// statusOf runs every handler against one service error and names the
// response type each produced.
func (s *MeasurementsSuite) statusOf(err error) []string {
	s.svc.err = err
	ctx := s.T().Context()
	body := &MeasurementWrite{Points: wirePoints}
	list, _ := s.srv.ListMeasurements(ctx, ListMeasurementsRequestObject{Slug: "yard"})
	created, _ := s.srv.CreateMeasurement(ctx, CreateMeasurementRequestObject{Slug: "yard", Body: body})
	updated, _ := s.srv.UpdateMeasurement(ctx, UpdateMeasurementRequestObject{Slug: "yard", Id: 7, Body: body})
	deleted, _ := s.srv.DeleteMeasurement(ctx, DeleteMeasurementRequestObject{Slug: "yard", Id: 7})
	cleared, _ := s.srv.DeleteMeasurements(ctx, DeleteMeasurementsRequestObject{Slug: "yard"})
	out := make([]string, 0, 5)
	for _, r := range []any{list, created, updated, deleted, cleared} {
		out = append(out, fmt.Sprintf("%T", r))
	}
	return out
}

func (s *MeasurementsSuite) TestErrorsMapToStatuses() {
	cases := []struct {
		name     string
		err      error
		expected []string
	}{
		{
			// A measurement of another territory is refused by catalog as not
			// found; it must reach the caller as 404, never as a 500.
			name: "foreign or unknown id",
			err:  fmt.Errorf("catalog: %w", domain.ErrMeasurementNotFound),
			expected: []string{
				"httpapi.ListMeasurements404JSONResponse",
				"httpapi.CreateMeasurement404JSONResponse",
				"httpapi.UpdateMeasurement404JSONResponse",
				"httpapi.DeleteMeasurement404JSONResponse",
				"httpapi.DeleteMeasurements404JSONResponse",
			},
		},
		{
			name: "invalid chain",
			err:  fmt.Errorf("%w: a closed chain needs three points", domain.ErrInvalidInput),
			expected: []string{
				"httpapi.ListMeasurements500JSONResponse",
				"httpapi.CreateMeasurement400JSONResponse",
				"httpapi.UpdateMeasurement400JSONResponse",
				"httpapi.DeleteMeasurement400JSONResponse",
				"httpapi.DeleteMeasurements400JSONResponse",
			},
		},
		{
			name: "catalog down",
			err:  errors.New("catalog down"),
			expected: []string{
				"httpapi.ListMeasurements500JSONResponse",
				"httpapi.CreateMeasurement500JSONResponse",
				"httpapi.UpdateMeasurement500JSONResponse",
				"httpapi.DeleteMeasurement500JSONResponse",
				"httpapi.DeleteMeasurements500JSONResponse",
			},
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			assert.DeepEqual(s.T(), s.statusOf(tc.err), tc.expected)
		})
	}
}

// The bundle always carries the list, [] when empty: the field is required in
// the spec and the client reads null as a broken bundle.
func (s *MeasurementsSuite) TestSceneBundleCarriesMeasurements() {
	empty := sceneBundleToAPI(domain.SceneBundle{})
	assert.Assert(s.T(), empty.Measurements != nil)
	assert.Equal(s.T(), len(empty.Measurements), 0)

	full := sceneBundleToAPI(domain.SceneBundle{Measurements: []domain.Measurement{{
		ID: 2, TerritorySlug: "yard", Points: []domain.Vec3{{X: 1}, {Y: 1}},
	}}})
	assert.Equal(s.T(), len(full.Measurements), 1)
	assert.Equal(s.T(), full.Measurements[0].Id, int64(2))
	assert.DeepEqual(s.T(), full.Measurements[0].Points, []Vec3{{X: 1}, {Y: 1}})
}
