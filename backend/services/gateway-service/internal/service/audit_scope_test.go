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

// read_own narrows to the caller. The company is set as well even though the
// actor pin is strictly tighter: two checks cost less than one argument about
// why one is enough.
func (s *AuditScopeSuite) TestReadOwnIsPinnedToTheCaller() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1", Perms: []string{"audit:read_own"},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.All, false)
	assert.Equal(s.T(), got.Company, "company-1")
	assert.Equal(s.T(), got.Actor, "user-7")
}

// Holding both, the wider one wins: a Company Owner who also carries read_own
// must not be narrowed to themselves.
func (s *AuditScopeSuite) TestReadBeatsReadOwn() {
	got, err := service.AuditScope(domain.AuditPrincipal{
		UserID: "user-7", Company: "company-1",
		Perms: []string{"audit:read_own", "audit:read"},
	})

	assert.NilError(s.T(), err)
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
