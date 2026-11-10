package httpapi

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

type TerritoryAdminsSuite struct{ suite.Suite }

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

// adminsStub records the scope it was asked for; anything else panics through
// the embedded nil Service.
type adminsStub struct {
	Service
	scope  *string
	all    *bool
	bySlug map[string][]string
}

func (a adminsStub) ListTerritoryAdmins(_ context.Context, scope string, all bool) (map[string][]string, error) {
	*a.scope, *a.all = scope, all
	return a.bySlug, nil
}

func (s *TerritoryAdminsSuite) TestRootReadsEveryTerritory() {
	scope, all := "unset", false
	stub := adminsStub{
		scope:  &scope,
		all:    &all,
		bySlug: map[string][]string{"tenant-a-scene": {"u1"}, "tenant-b-scene": {}},
	}
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")

	resp, err := New(stub).ListTerritoryAdmins(ctx, ListTerritoryAdminsRequestObject{})
	assert.NilError(s.T(), err)
	got, ok := resp.(ListTerritoryAdmins200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.DeepEqual(s.T(), map[string][]string(got), stub.bySlug)
	assert.Equal(s.T(), scope, "")
	assert.Assert(s.T(), all, "Root reads with all access")
}

// A Company Owner is refused exactly as on the per-slug read: the batch must
// not become a way to learn another tenant's assignments.
func (s *TerritoryAdminsSuite) TestACompanyOwnerIsRefused() {
	scope := "unset"
	ctx := authhttp.NewTestContext(s.T().Context(), false, "admin-a")

	resp, err := New(adminsStub{scope: &scope}).ListTerritoryAdmins(ctx, ListTerritoryAdminsRequestObject{})
	assert.NilError(s.T(), err)
	_, ok := resp.(ListTerritoryAdmins403JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), scope, "unset", "the service must not be asked")
}

// failingAdmins answers the batch read with a failure.
type failingAdmins struct{ Service }

func (failingAdmins) ListTerritoryAdmins(context.Context, string, bool) (map[string][]string, error) {
	return nil, errors.New("catalog down")
}

// A failed read is a 500, never a 200 with an empty map: the access screen
// would read that as "nobody is assigned anywhere".
func (s *TerritoryAdminsSuite) TestAFailedReadIsAnInternalError() {
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")

	resp, err := New(failingAdmins{}).ListTerritoryAdmins(ctx, ListTerritoryAdminsRequestObject{})
	assert.NilError(s.T(), err)
	_, ok := resp.(ListTerritoryAdmins500JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}

type PerTerritoryAdminsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	srv *Server
	ctx context.Context
}

func TestPerTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(PerTerritoryAdminsSuite)) }

func (s *PerTerritoryAdminsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.srv = New(service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc)))
	s.ctx = authhttp.NewTestContext(s.T().Context(), true, "")
}

func (s *PerTerritoryAdminsSuite) TestNonRootCannotReadOrWrite() {
	ctx := authhttp.NewTestContext(s.T().Context(), false, "admin-a")
	get, err := s.srv.GetTerritoryAdmins(ctx, GetTerritoryAdminsRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), get, GetTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenRoot()})
	put, err := s.srv.SetTerritoryAdmins(ctx, SetTerritoryAdminsRequestObject{
		Slug: "yard", Body: &TerritoryAdmins{UserIds: []string{"u1"}},
	})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), put, SetTerritoryAdmins403JSONResponse{ForbiddenJSONResponse: forbiddenRoot()})
	assert.Equal(s.T(), s.cat.GetTerritoryAdminsBeforeCounter(), uint64(0))
	assert.Equal(s.T(), s.cat.SetTerritoryAdminsBeforeCounter(), uint64(0))
}

func (s *PerTerritoryAdminsSuite) TestGet() {
	for _, tc := range []struct {
		name    string
		failure error
		want    any
	}{
		{"success", nil, GetTerritoryAdmins200JSONResponse{UserIds: []string{"u1", "u2"}}},
		{"unknown territory", domain.ErrTerritoryNotFound, GetTerritoryAdmins404JSONResponse{}},
		{"invalid slug", domain.ErrInvalidInput, GetTerritoryAdmins404JSONResponse{}},
		{"internal", errors.New("catalog down"), GetTerritoryAdmins500JSONResponse{}},
	} {
		s.Run(tc.name, func() {
			mc := minimock.NewController(s.T())
			cat := mocks.NewCatalogMock(mc)
			srv := New(service.New(cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
				mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc)))
			cat.GetTerritoryAdminsMock.Expect(s.ctx, "yard").Return([]string{"u1", "u2"}, tc.failure)
			got, err := srv.GetTerritoryAdmins(s.ctx, GetTerritoryAdminsRequestObject{Slug: "yard"})
			assert.NilError(s.T(), err)
			switch tc.want.(type) {
			case GetTerritoryAdmins200JSONResponse:
				assert.DeepEqual(s.T(), got, tc.want)
			case GetTerritoryAdmins404JSONResponse:
				_, ok := got.(GetTerritoryAdmins404JSONResponse)
				assert.Assert(s.T(), ok, "got %T", got)
			case GetTerritoryAdmins500JSONResponse:
				response, ok := got.(GetTerritoryAdmins500JSONResponse)
				assert.Assert(s.T(), ok, "got %T", got)
				assert.Equal(s.T(), response.Code, apperr.SlugInternal)
				assert.Equal(s.T(), response.Message, apperr.InternalMessage)
			}
		})
	}
}

func (s *PerTerritoryAdminsSuite) TestSetMissingBodySkipsService() {
	got, err := s.srv.SetTerritoryAdmins(s.ctx, SetTerritoryAdminsRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	_, ok := got.(SetTerritoryAdmins400JSONResponse)
	assert.Assert(s.T(), ok, "got %T", got)
	assert.Equal(s.T(), s.cat.SetTerritoryAdminsBeforeCounter(), uint64(0))
}

func (s *PerTerritoryAdminsSuite) TestSet() {
	for _, tc := range []struct {
		name    string
		failure error
		want    any
	}{
		{"success", nil, SetTerritoryAdmins204Response{}},
		{"invalid IDs", domain.ErrInvalidInput, SetTerritoryAdmins400JSONResponse{}},
		{"unknown territory", domain.ErrTerritoryNotFound, SetTerritoryAdmins404JSONResponse{}},
		{"internal", errors.New("catalog down"), SetTerritoryAdmins500JSONResponse{}},
	} {
		s.Run(tc.name, func() {
			mc := minimock.NewController(s.T())
			cat := mocks.NewCatalogMock(mc)
			srv := New(service.New(cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
				mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc)))
			ids := []string{"u1", "u2"}
			cat.SetTerritoryAdminsMock.Expect(s.ctx, "yard", ids).Return(tc.failure)
			got, err := srv.SetTerritoryAdmins(
				s.ctx,
				SetTerritoryAdminsRequestObject{Slug: "yard", Body: &TerritoryAdmins{UserIds: ids}},
			)
			assert.NilError(s.T(), err)
			switch tc.want.(type) {
			case SetTerritoryAdmins204Response:
				assert.DeepEqual(s.T(), got, tc.want)
			case SetTerritoryAdmins400JSONResponse:
				_, ok := got.(SetTerritoryAdmins400JSONResponse)
				assert.Assert(s.T(), ok, "got %T", got)
			case SetTerritoryAdmins404JSONResponse:
				_, ok := got.(SetTerritoryAdmins404JSONResponse)
				assert.Assert(s.T(), ok, "got %T", got)
			case SetTerritoryAdmins500JSONResponse:
				response, ok := got.(SetTerritoryAdmins500JSONResponse)
				assert.Assert(s.T(), ok, "got %T", got)
				assert.Equal(s.T(), response.Code, apperr.SlugInternal)
				assert.Equal(s.T(), response.Message, apperr.InternalMessage)
			}
		})
	}
}
