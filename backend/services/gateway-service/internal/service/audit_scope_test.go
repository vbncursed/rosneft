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
	all, company, err := service.AuditScope(true, "")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), all, true)
	assert.Equal(s.T(), company, "")
}

func (s *AuditScopeSuite) TestCompanyOwnerIsPinnedToOwnCompany() {
	all, company, err := service.AuditScope(false, "company-1")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), all, false)
	assert.Equal(s.T(), company, "company-1")
}

// A principal that is neither Root nor attached to a company must be refused,
// never widened: an empty company with all=false matches the NULL-company rows,
// which are exactly Root's and the system's actions.
func (s *AuditScopeSuite) TestUnattachedPrincipalIsRefused() {
	all, company, err := service.AuditScope(false, "")

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
	assert.Equal(s.T(), all, false)
	assert.Equal(s.T(), company, "")
}

// The owner flag is the authority: a stale company id on a Root principal must
// not narrow what Root can see.
func (s *AuditScopeSuite) TestRootIgnoresCompanyID() {
	all, company, err := service.AuditScope(true, "company-1")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), all, true)
	assert.Equal(s.T(), company, "")
}
