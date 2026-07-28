package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
)

type ValidateTokenSuite struct {
	suite.Suite
	svc *auth.Service
	us  *mocks.UserStoreMock
	ss  *mocks.SessionStoreMock
	tf  *mocks.TwoFAVerifierMock
	pk  *mocks.PasskeyVerifierMock
	ctx context.Context
}

func TestValidateTokenSuite(t *testing.T) {
	suite.Run(t, new(ValidateTokenSuite))
}

func (s *ValidateTokenSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.us = mocks.NewUserStoreMock(mc)
	s.ss = mocks.NewSessionStoreMock(mc)
	s.tf = mocks.NewTwoFAVerifierMock(mc)
	s.pk = mocks.NewPasskeyVerifierMock(mc)
	s.svc = auth.New(s.us, s.ss, s.tf, s.pk, 720*time.Hour)
	s.ctx = s.T().Context()
}

// A guest's territory scope is deliberately keyed to its own id, but audit
// attribution must stay with the real tenant — otherwise a guest's changes
// would land in a one-person company its Company Owner cannot see.
func (s *ValidateTokenSuite) TestGuestKeepsRealCompanyForAudit() {
	u := domain.User{
		ID:          "guest-1",
		RoleSlugs:   []string{"guest"},
		Permissions: []string{"territory:read"},
	}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "guest-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "guest-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "guest-1").Return("company-1", nil)

	uid, perms, isOwner, owningAdmin, auditCompany, err := s.svc.ValidateToken(s.ctx, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), uid, "guest-1")
	assert.Equal(s.T(), len(perms), 1)
	assert.Equal(s.T(), isOwner, false)
	assert.Equal(s.T(), owningAdmin, "guest-1")    // territory scope: self
	assert.Equal(s.T(), auditCompany, "company-1") // audit: the real tenant
}

// A Root belongs to no company, so its actions carry a NULL company and stay
// invisible to every Company Owner.
func (s *ValidateTokenSuite) TestRootHasNoCompany() {
	u := domain.User{ID: "root-1", IsOwner: true, RoleSlugs: []string{"admin"}}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "root-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "root-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "root-1").Return("", nil)

	_, _, isOwner, owningAdmin, auditCompany, err := s.svc.ValidateToken(s.ctx, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), isOwner, true)
	assert.Equal(s.T(), owningAdmin, "")
	assert.Equal(s.T(), auditCompany, "")
}

// For a non-guest the two keys coincide; the audit company must not be dropped
// just because it duplicates the territory scope.
func (s *ValidateTokenSuite) TestEmployeeCarriesCompanyOnBothKeys() {
	u := domain.User{ID: "emp-1", RoleSlugs: []string{"editor"}}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "emp-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "emp-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "emp-1").Return("company-1", nil)

	_, _, _, owningAdmin, auditCompany, err := s.svc.ValidateToken(s.ctx, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), owningAdmin, "company-1")
	assert.Equal(s.T(), auditCompany, "company-1")
}

// The authz cache must carry the audit company too — a second call inside the
// TTL hits the cache and would otherwise return an empty company, silently
// turning an employee's change into a system change.
func (s *ValidateTokenSuite) TestCachedHitKeepsAuditCompany() {
	u := domain.User{ID: "emp-1", RoleSlugs: []string{"editor"}}
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "emp-1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "emp-1").Return(u, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "emp-1").Return("company-1", nil)

	_, _, _, _, first, err := s.svc.ValidateToken(s.ctx, "tok")
	assert.NilError(s.T(), err)

	// GetByID/ResolveOwningAdmin are expected once; a second DB hit would fail
	// the minimock controller, so this also proves the cache was used.
	_, _, _, _, second, err := s.svc.ValidateToken(s.ctx, "tok")
	assert.NilError(s.T(), err)

	assert.Equal(s.T(), first, "company-1")
	assert.Equal(s.T(), second, "company-1")
}
