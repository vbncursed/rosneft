package service_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// AuditScopeSuite covers the security boundary of the audit journal: it decides
// whose entries a caller may read. It is built to fail closed, so the cases
// that matter most are the ones where the principal is incomplete.
type AuditScopeSuite struct {
	suite.Suite
}

func TestAuditScopeSuite(t *testing.T) {
	suite.Run(t, new(AuditScopeSuite))
}

func (s *AuditScopeSuite) TestRootReadsEverything() {
	got, err := service.AuditScope(domain.AuditPrincipal{IsOwner: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, true)
	assert.Equal(s.T(), got.Company, "")
	assert.Equal(s.T(), got.Actor, "")
}

func (s *AuditScopeSuite) TestCompanyOwnerIsPinnedToOwnCompany() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		Company: "company-1", Perms: []string{"audit:read"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, false)
	assert.Equal(s.T(), got.Company, "company-1")
	assert.Equal(s.T(), got.Actor, "")
}

// read_own does not reach the company journal at all any more. It opens
// /api/audit/mine and nothing else — whose rows a caller sees is decided by the
// route, not by which grant they happen to hold.
func (s *AuditScopeSuite) TestReadOwnNoLongerOpensTheCompanyJournal() {
	_, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"audit:read_own"},
	})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

// A Company Owner carries both grants. On this route the narrower one is simply
// not consulted, so the scope is the company with no actor pin.
func (s *AuditScopeSuite) TestBothGrantsGiveTheCompanyScope() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1",
		Perms: []string{"audit:read_own", "audit:read"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Company, "company-1")
	assert.Equal(s.T(), got.Actor, "")
}

func (s *AuditScopeSuite) TestNoAuditPermissionIsRefused() {
	_, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"territory:read"},
	})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

// A principal that is neither Root nor attached to a company must be refused,
// never widened: an empty company with all=false matches the NULL-company rows,
// which are exactly Root's and the system's actions.
func (s *AuditScopeSuite) TestUnattachedPrincipalIsRefused() {
	_, err := service.AuditScope(domain.AuditPrincipal{Perms: []string{"audit:read"}})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

// The owner flag is the authority: a stale company id on a Root principal must
// not narrow what Root can see.
func (s *AuditScopeSuite) TestRootIgnoresCompanyID() {
	got, err := service.AuditScope(domain.AuditPrincipal{IsOwner: true, Company: "company-1"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, true)
	assert.Equal(s.T(), got.Company, "")
}

// AuditOwnScopeSuite covers the other journal: the caller's own actions. Its
// whole reason to exist separately is that the actor cannot be argued out of
// the filter — not by a grant, not by a parameter.
type AuditOwnScopeSuite struct {
	suite.Suite
}

func TestAuditOwnScopeSuite(t *testing.T) {
	suite.Run(t, new(AuditOwnScopeSuite))
}

func (s *AuditOwnScopeSuite) TestPinsToTheActor() {
	got, err := service.AuditOwnScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"audit:read_own"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, false)
	assert.Equal(s.T(), got.Company, "company-1")
	assert.Equal(s.T(), got.Actor, "user-7")
}

// The wider grant reaches this route too: a Company Owner holds audit:read and
// must not lose their own account page over it.
func (s *AuditOwnScopeSuite) TestAcceptsTheWiderGrant() {
	got, err := service.AuditOwnScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"audit:read"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Actor, "user-7")
}

// Root is pinned here as well. The page means "what I did", and answering it
// with everyone's actions would make the heading a lie for exactly one user.
func (s *AuditOwnScopeSuite) TestPinsRootToo() {
	got, err := service.AuditOwnScope(domain.AuditPrincipal{IsOwner: true, UserID: "root-1"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, true)
	assert.Equal(s.T(), got.Actor, "root-1")
}

func (s *AuditOwnScopeSuite) TestGrantlessPrincipalIsRefused() {
	_, err := service.AuditOwnScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"territory:read"},
	})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

// Without a user id there is no actor to pin to, so the filter would fall back
// to the company — the opposite of what this route promises. Fail closed.
func (s *AuditOwnScopeSuite) TestMissingUserIDIsRefused() {
	_, err := service.AuditOwnScope(domain.AuditPrincipal{
		Company: "company-1", Perms: []string{"audit:read_own"},
	})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

func (s *AuditOwnScopeSuite) TestUnattachedNonRootIsRefused() {
	_, err := service.AuditOwnScope(domain.AuditPrincipal{
		UserID: "user-7", Perms: []string{"audit:read_own"},
	})

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}
