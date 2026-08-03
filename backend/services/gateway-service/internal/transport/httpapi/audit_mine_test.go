package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListMyAuditSuite covers the own-journal route. Its reason to exist apart from
// GET /api/audit is that the actor cannot be argued out of the filter — not by
// a grant the caller happens to hold, and not by a query parameter. Both are
// what these tests pin down.
type ListMyAuditSuite struct {
	suite.Suite
}

func TestListMyAuditSuite(t *testing.T) { suite.Run(t, new(ListMyAuditSuite)) }

// mineServiceStub implements only ListAudit. Embedding Service leaves every
// other method nil, so a handler that reaches for one panics — which is the
// signal we want rather than a silently passing test.
type mineServiceStub struct {
	Service
	seen domain.AuditQuery
	err  error
}

func (m *mineServiceStub) ListAudit(
	_ context.Context, q domain.AuditQuery, sc domain.AuditScope, _ string, _ bool,
) ([]domain.AuditEntry, int64, map[string]string, error) {
	// The handler is expected to hand the scope straight through; recording the
	// merged result is what lets a test assert on the actor that survived.
	q.AllCompanies, q.CompanyID = sc.All, sc.Company
	if sc.Actor != "" {
		q.ActorID = sc.Actor
	}
	m.seen = q
	return nil, 0, nil, m.err
}

func (s *ListMyAuditSuite) ctxFor(p authhttp.TestPrincipal) context.Context {
	return authhttp.NewTestContextFor(s.T().Context(), p)
}

// The route takes no actor parameter at all — ListMyAuditParams has no such
// field — so this test pins the property one level up: whatever the caller is,
// the query that reaches the service names them and nobody else.
func (s *ListMyAuditSuite) TestPinsTheActorToTheSession() {
	svc := &mineServiceStub{}
	ctx := s.ctxFor(authhttp.TestPrincipal{
		UserID: "me", Perms: []string{"audit:read"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	resp, err := New(svc).ListMyAudit(ctx, ListMyAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.ActorID, "me")
	assert.Equal(s.T(), svc.seen.CompanyID, "company-1")
	_, ok := resp.(ListMyAudit200JSONResponse)
	assert.Assert(s.T(), ok, "expected 200, got %T", resp)
}

// A Company Owner holds audit:read and would be handed the whole company by
// AuditScope. This route must not consult that grant's width.
func (s *ListMyAuditSuite) TestCompanyOwnerStillSeesOnlyThemselves() {
	svc := &mineServiceStub{}
	ctx := s.ctxFor(authhttp.TestPrincipal{
		UserID: "owner-1", Perms: []string{"audit:read", "audit:read_own"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	_, err := New(svc).ListMyAudit(ctx, ListMyAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.ActorID, "owner-1")
	assert.Equal(s.T(), svc.seen.AllCompanies, false)
}

func (s *ListMyAuditSuite) TestReadOwnIsAccepted() {
	svc := &mineServiceStub{}
	ctx := s.ctxFor(authhttp.TestPrincipal{
		UserID: "viewer-1", Perms: []string{"audit:read_own"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	resp, err := New(svc).ListMyAudit(ctx, ListMyAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.ActorID, "viewer-1")
	_, ok := resp.(ListMyAudit200JSONResponse)
	assert.Assert(s.T(), ok, "expected 200, got %T", resp)
}

// Root reads this route to see what Root did, not what everyone did.
func (s *ListMyAuditSuite) TestRootIsPinnedToo() {
	svc := &mineServiceStub{}
	ctx := s.ctxFor(authhttp.TestPrincipal{UserID: "root-1", IsOwner: true})

	_, err := New(svc).ListMyAudit(ctx, ListMyAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.ActorID, "root-1")
}

func (s *ListMyAuditSuite) TestGrantlessPrincipalIsRefused() {
	svc := &mineServiceStub{}
	ctx := s.ctxFor(authhttp.TestPrincipal{
		UserID: "nobody", Perms: []string{"territory:read"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	resp, err := New(svc).ListMyAudit(ctx, ListMyAuditRequestObject{})

	assert.NilError(s.T(), err)
	_, ok := resp.(ListMyAudit403JSONResponse)
	assert.Assert(s.T(), ok, "expected 403, got %T", resp)
	assert.Equal(s.T(), svc.seen.ActorID, "", "a refused caller must not reach the service at all")
}
