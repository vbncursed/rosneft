package authhttp

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// catalogScopes answers ListTerritories from a map of scope → slugs, or fails
// every call with err. "" maps to the whole catalog, as the real one answers an
// empty scope, so a check that forgot to fail closed would read it as allowed.
type catalogScopes struct {
	by  map[string][]string
	err error
}

func (c catalogScopes) ListTerritories(_ context.Context, scope string, _ bool) ([]domain.Territory, error) {
	if c.err != nil {
		return nil, c.err
	}
	out := make([]domain.Territory, 0, len(c.by[scope]))
	for _, slug := range c.by[scope] {
		out = append(out, domain.Territory{Slug: slug})
	}
	return out, nil
}

// u-1 is the target of every putAs; company-a is the delegate's scope.
var delegate = TestPrincipal{UserID: "delegate", Perms: []string{"users:write"}, OwningAdmin: "company-a"}

const pw = `{"password":"N3w-Passw0rd!"}`

// Root granted the guest a territory its creator cannot open: resetting the
// guest's password would let the creator sign in as it and open X.
func (s *SetUserPasswordSuite) TestRefusesATargetHoldingATerritoryTheCallerCannotSee() {
	stub := newPasswordAuth(nil)
	cat := catalogScopes{by: map[string][]string{"company-a": {"yard"}, "u-1": {"yard", "x"}}}

	rec := s.putAs(stub, cat, delegate, pw)

	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "you cannot grant access you do not have yourself"), rec.Body.String())
	assert.Equal(s.T(), len(stub.got), 0, "the password must not change")
}

func (s *SetUserPasswordSuite) TestAllowsATargetWhoseTerritoriesTheCallerAllSees() {
	stub := newPasswordAuth(nil)
	cat := catalogScopes{by: map[string][]string{"company-a": {"yard", "x"}, "u-1": {"x"}}}

	rec := s.putAs(stub, cat, delegate, pw)

	assert.Equal(s.T(), rec.Code, http.StatusNoContent)
	assert.Equal(s.T(), len(stub.got), 1)
}

// Root sees every territory, so there is nothing to compare: a catalog that
// fails every call proves it is never asked.
func (s *SetUserPasswordSuite) TestRootSkipsTheComparison() {
	stub := newPasswordAuth(nil)

	rec := s.putAs(stub, catalogScopes{err: errors.New("catalog down")}, TestPrincipal{UserID: "root", IsOwner: true}, pw)

	assert.Equal(s.T(), rec.Code, http.StatusNoContent)
}

// A catalog that cannot answer is not a target with no territories.
func (s *SetUserPasswordSuite) TestACatalogFailureRefusesRatherThanPasses() {
	stub := newPasswordAuth(nil)

	rec := s.putAs(stub, catalogScopes{err: errors.New("catalog down")}, delegate, pw)

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), len(stub.got), 0)
}

// A non-Root caller with no scope sees nothing — never the whole catalog the
// empty scope would mean to the catalog.
func (s *SetUserPasswordSuite) TestAnEmptyScopeSeesNothing() {
	stub := newPasswordAuth(nil)
	cat := catalogScopes{by: map[string][]string{"": {"x"}, "u-1": {"x"}}}

	rec := s.putAs(stub, cat, TestPrincipal{UserID: "delegate", Perms: []string{"users:write"}}, pw)

	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
	assert.Equal(s.T(), len(stub.got), 0)
}

// A target outside the caller's user scope answers auth-service's 404 before
// any territory is compared: a 403 there would confirm the account exists.
func (s *SetUserPasswordSuite) TestAnOutOfScopeTargetReadsAsMissing() {
	stub := newPasswordAuth(nil)
	stub.getErr = status.Error(codes.NotFound, "user not found")

	rec := s.putAs(stub, catalogScopes{err: errors.New("must not be asked")}, delegate, pw)

	assert.Equal(s.T(), rec.Code, http.StatusNotFound)
	assert.Equal(s.T(), len(stub.got), 0)
}
