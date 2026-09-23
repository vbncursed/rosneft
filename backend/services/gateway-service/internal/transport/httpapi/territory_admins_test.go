package httpapi

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

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
	stub := adminsStub{scope: &scope, all: &all, bySlug: map[string][]string{"tenant-a-scene": {"u1"}, "tenant-b-scene": {}}}
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
